import { PrismaClient, Prisma } from '@prisma/client';

const g = globalThis as unknown as { __prisma?: PrismaClient };

export const prisma =
  g.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') g.__prisma = prisma;

/** Either the global client or an interactive-transaction client. */
export type Db = PrismaClient | Prisma.TransactionClient;

/** Run `fn` inside a database transaction (all-or-nothing). */
export function inTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(fn, { maxWait: 10_000, timeout: 20_000 });
}

export { Prisma };
