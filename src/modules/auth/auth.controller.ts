import { route } from '@/shared/http/api';
import { googleEnabled } from './auth';
import { otpSendSchema } from './auth.schema';
import { sendOtp } from './otp.service';

export const authRoutes = [
  // NOTE: lives at /api/otp/send because /api/auth/* is owned by Auth.js
  route('POST', 'otp/send', async (ctx) => {
    const { phone } = await ctx.body(otpSendSchema);
    await sendOtp({ phone, purpose: 'LOGIN', ip: ctx.ip });
    return { sent: true };
  }),

  route('GET', 'config', async () => ({ googleEnabled })),
];
