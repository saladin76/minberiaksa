// lib/prisma.ts

import { PrismaClient, type Prisma } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prismaBankLedgerPrivate: PrismaClient | undefined;
};

// Financial reasons, staff identities and unresolved-bank evidence are admin-only.
// Explicit selects in the authorized bank-operation service opt back into these fields.
const options: Prisma.PrismaClientOptions = {
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  omit: { donation: { bankOperations: true, bankOperationLock: true, bankLastInquiry: true, bankOperationsRevision: true } },
};

export const prisma =
  globalForPrisma.prismaBankLedgerPrivate ??
  new PrismaClient(options);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prismaBankLedgerPrivate = prisma;
}
