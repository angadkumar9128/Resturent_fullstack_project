import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { PrismaAdapter } from '@auth/prisma-adapter';
import type { Adapter } from 'next-auth/adapters';
import type { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { prisma } from '@/shared/db/prisma';
import { rateLimit } from '@/shared/security/rate-limit';
import { otpLoginSchema, passwordLoginSchema } from './auth.schema';
import { verifyOtp } from './otp.service';

declare module 'next-auth' {
  interface Session {
    user: { id: string; role: Role } & DefaultSession['user'];
  }
}

export const googleEnabled = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma) as unknown as Adapter,
  // Stateless JWT stored in an HTTP-only, SameSite=Lax (Secure in production) cookie.
  session: { strategy: 'jwt', maxAge: 30 * 24 * 60 * 60 },
  trustHost: true,
  pages: { signIn: '/login' },
  providers: [
    // Customers: mobile number + OTP
    Credentials({
      id: 'otp',
      name: 'Mobile OTP',
      credentials: { phone: {}, code: {} },
      async authorize(raw) {
        const parsed = otpLoginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { phone, code } = parsed.data;
        const ok = await verifyOtp({ phone, purpose: 'LOGIN', code });
        if (!ok) return null;
        const user = await prisma.user.upsert({
          where: { phone },
          update: { phoneVerified: new Date() },
          create: { phone, phoneVerified: new Date() },
        });
        if (!user.isActive) return null;
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
    // Staff / admin: email + password
    Credentials({
      id: 'password',
      name: 'Email & password',
      credentials: { email: {}, password: {} },
      async authorize(raw) {
        const parsed = passwordLoginSchema.safeParse(raw);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        try {
          await rateLimit(`login:${email}`, 10, 900);
        } catch {
          return null;
        }
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.passwordHash || !user.isActive) return null;
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok) return null;
        return { id: user.id, name: user.name, email: user.email };
      },
    }),
    ...(googleEnabled ? [Google] : []),
  ],
  callbacks: {
    // Role is re-read from the DB so demoting/disabling a user takes effect immediately.
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      if (token.sub) {
        const u = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { role: true, isActive: true },
        });
        (token as Record<string, unknown>).role = u?.isActive ? u.role : null;
      }
      return token;
    },
    async session({ session, token }) {
      const role = (token as Record<string, unknown>).role as Role | null | undefined;
      if (!token.sub || !role) {
        // disabled/deleted user => treat as signed out
        return { ...session, user: undefined } as unknown as typeof session;
      }
      session.user.id = token.sub;
      session.user.role = role;
      return session;
    },
  },
});
