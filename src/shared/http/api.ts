import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import type { ZodType, ZodTypeDef } from 'zod';
import { AppError, E, normalizeError } from '@/shared/errors/app-error';
import { assertSameOrigin } from '@/shared/security/origin';

export type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface Ctx {
  req: NextRequest;
  params: Record<string, string>;
  query: URLSearchParams;
  requestId: string;
  ip: string;
  /** Parse + validate the JSON body with Zod. Throws a 400 VALIDATION_ERROR on failure. */
  body<T>(schema: ZodType<T, ZodTypeDef, unknown>): Promise<T>;
  /** Parse + validate the query string with Zod. */
  parseQuery<T>(schema: ZodType<T, ZodTypeDef, unknown>): T;
}

export interface Route {
  method: Method;
  pattern: string[];
  handler: (ctx: Ctx) => Promise<unknown>;
  skipOrigin: boolean;
}

/** Declare a route. Path params use `:name`. Handler may return data (wrapped as {data}) or a Response. */
export function route(
  method: Method,
  path: string,
  handler: (ctx: Ctx) => Promise<unknown>,
  options: { skipOrigin?: boolean } = {},
): Route {
  return { method, pattern: path.split('/').filter(Boolean), handler, skipOrigin: options.skipOrigin ?? false };
}

function match(pattern: string[], segments: string[]): Record<string, string> | null {
  if (pattern.length !== segments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < pattern.length; i++) {
    const p = pattern[i]!;
    const s = segments[i]!;
    if (p.startsWith(':')) params[p.slice(1)] = decodeURIComponent(s);
    else if (p !== s) return null;
  }
  return params;
}

function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? req.headers.get('x-real-ip') ?? 'unknown'
  );
}

/** Global entry point: routing, CSRF check, error handling, standard JSON envelope. */
export async function dispatch(routes: Route[], req: NextRequest, segments: string[]): Promise<Response> {
  const requestId = randomUUID();
  try {
    const method = req.method as Method;
    let pathMatched = false;

    for (const r of routes) {
      const params = match(r.pattern, segments);
      if (!params) continue;
      pathMatched = true;
      if (r.method !== method) continue;

      if (method !== 'GET' && !r.skipOrigin) assertSameOrigin(req);

      const ctx: Ctx = {
        req,
        params,
        query: req.nextUrl.searchParams,
        requestId,
        ip: clientIp(req),
        async body(schema) {
          let raw: unknown;
          try {
            raw = await req.json();
          } catch {
            throw E.badRequest('Request body must be valid JSON');
          }
          return schema.parse(raw);
        },
        parseQuery(schema) {
          return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
        },
      };

      const result = await r.handler(ctx);
      if (result instanceof Response) {
        result.headers.set('x-request-id', requestId);
        return result;
      }
      return NextResponse.json({ data: result ?? null }, { headers: { 'x-request-id': requestId } });
    }

    throw pathMatched ? new AppError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed') : E.notFound('Route not found');
  } catch (err) {
    const e = normalizeError(err);
    if (e.status >= 500) console.error(`[${requestId}]`, err);
    return NextResponse.json(
      { error: { code: e.code, message: e.message, details: e.details }, requestId },
      { status: e.status, headers: { 'x-request-id': requestId } },
    );
  }
}
