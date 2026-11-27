import type { NextRequest } from 'next/server';
import { E } from '@/shared/errors/app-error';

/**
 * CSRF defence for cookie-authenticated, state-changing requests.
 * Browsers always send Origin on cross-origin POST/PATCH/DELETE; we reject mismatches.
 * (Cookies are also SameSite=Lax.) Webhooks opt out and use signature verification instead.
 */
export function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (origin) {
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
    let originHost = '';
    try {
      originHost = new URL(origin).host;
    } catch {
      throw E.forbidden('Invalid origin');
    }
    if (originHost !== host) throw E.forbidden('Cross-origin request blocked');
  }
  if (req.headers.get('sec-fetch-site') === 'cross-site') throw E.forbidden('Cross-site request blocked');
}
