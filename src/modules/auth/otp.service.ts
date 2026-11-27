import { createHmac, randomInt, timingSafeEqual } from 'crypto';
import { env } from '@/shared/config/env';
import { prisma } from '@/shared/db/prisma';
import { E } from '@/shared/errors/app-error';
import { rateLimit } from '@/shared/security/rate-limit';
import { sendOtpSms } from '@/modules/notifications/notifications.service';

type Purpose = 'LOGIN' | 'COD_VERIFY';

const OTP_TTL_MS = 5 * 60_000;
const RESEND_COOLDOWN_MS = 30_000;

function hashCode(phone: string, code: string): string {
  return createHmac('sha256', env.AUTH_SECRET).update(`${phone}:${code}`).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function sendOtp(args: { phone: string; purpose: Purpose; orderId?: string; ip: string }) {
  const { phone, purpose, orderId, ip } = args;
  await rateLimit(`otp:phone:${phone}`, 5, 3600, 'Too many OTP requests for this number. Please try again in an hour.');
  await rateLimit(`otp:ip:${ip}`, 20, 3600, 'Too many OTP requests from your network. Please try again later.');

  const recent = await prisma.otpChallenge.findFirst({
    where: { phone, purpose, createdAt: { gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } },
  });
  if (recent) throw E.tooMany('Please wait 30 seconds before requesting another code');

  // Invalidate older codes so only the newest one works.
  await prisma.otpChallenge.updateMany({ where: { phone, purpose, consumedAt: null }, data: { consumedAt: new Date() } });

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await prisma.otpChallenge.create({
    data: { phone, purpose, orderId, codeHash: hashCode(phone, code), expiresAt: new Date(Date.now() + OTP_TTL_MS) },
  });

  try {
    await sendOtpSms(phone, code);
  } catch (err) {
    console.error('OTP delivery failed', err);
    throw E.unprocessable('Could not send the OTP right now. Please try again.');
  }
}

/** Returns true only for a correct, unexpired, unused code within the attempt limit. */
export async function verifyOtp(args: { phone: string; purpose: Purpose; code: string; orderId?: string }): Promise<boolean> {
  const { phone, purpose, code, orderId } = args;
  const challenge = await prisma.otpChallenge.findFirst({
    where: { phone, purpose, consumedAt: null, expiresAt: { gt: new Date() }, ...(orderId ? { orderId } : {}) },
    orderBy: { createdAt: 'desc' },
  });
  if (!challenge) return false;

  // Atomically count the attempt; refuses once the cap is reached (brute-force protection).
  const counted = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null, attempts: { lt: challenge.maxAttempts } },
    data: { attempts: { increment: 1 } },
  });
  if (counted.count === 0) return false;

  if (!safeEqual(hashCode(phone, code), challenge.codeHash)) return false;

  // Single use: only one concurrent request can consume it.
  const consumed = await prisma.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return consumed.count === 1;
}
