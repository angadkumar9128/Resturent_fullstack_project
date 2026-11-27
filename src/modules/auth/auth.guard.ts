import type { Role } from '@prisma/client';
import { E } from '@/shared/errors/app-error';
import { auth } from './auth';

export interface SessionUser {
  id: string;
  role: Role;
  name?: string | null;
  email?: string | null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const u = session?.user;
  if (!u?.id || !u.role) return null;
  return { id: u.id, role: u.role, name: u.name, email: u.email };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw E.unauthorized();
  return user;
}

/** RBAC guard: throws 401 if signed out, 403 if the role is not allowed. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw E.forbidden();
  return user;
}

export const isStaff = (u: SessionUser | null) => u?.role === 'ADMIN' || u?.role === 'KITCHEN_STAFF';
