import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const E = {
  badRequest: (message = 'Bad request', details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details),
  unauthorized: (message = 'Please sign in to continue') => new AppError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'You do not have permission to do that') => new AppError(403, 'FORBIDDEN', message),
  notFound: (message = 'Not found') => new AppError(404, 'NOT_FOUND', message),
  conflict: (message = 'Conflict') => new AppError(409, 'CONFLICT', message),
  unprocessable: (message = 'Request cannot be processed', details?: unknown) =>
    new AppError(422, 'UNPROCESSABLE', message, details),
  tooMany: (message = 'Too many requests, please try again later') => new AppError(429, 'RATE_LIMITED', message),
};

/** Convert anything thrown into a safe, standard AppError. Internals are never leaked. */
export function normalizeError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return new AppError(400, 'VALIDATION_ERROR', 'Some fields are invalid', err.flatten());
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return new AppError(409, 'CONFLICT', 'That record already exists');
    if (err.code === 'P2025') return new AppError(404, 'NOT_FOUND', 'Record not found');
  }
  return new AppError(500, 'INTERNAL', 'Something went wrong on our side. Please try again.');
}
