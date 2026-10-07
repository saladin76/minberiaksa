import { prisma } from "@/lib/prisma";

const TRANSACTIONS_COLLECTION = "BankTransferTransaction";
const UPLOADS_COLLECTION = "BankStatementUpload";

let ready: Promise<void> | null = null;

async function createIndexes() {
  await Promise.all([
    prisma.$runCommandRaw({
      createIndexes: TRANSACTIONS_COLLECTION,
      indexes: [
        { key: { transactionHash: 1 }, name: "transactionHash_1" },
        { key: { direction: 1, status: 1, createdAt: -1 }, name: "direction_status_createdAt" },
        { key: { bankId: 1, currency: 1, donorLocale: 1 }, name: "bank_currency_locale" },
        { key: { transactionDate: -1 }, name: "transactionDate_desc" },
        { key: { donationId: 1 }, name: "donationId_1", sparse: true },
      ],
    }).catch(() => null),
    prisma.$runCommandRaw({
      createIndexes: UPLOADS_COLLECTION,
      indexes: [
        { key: { fileHash: 1 }, name: "fileHash_1" },
        { key: { bankId: 1, createdAt: -1 }, name: "bank_createdAt" },
      ],
    }).catch(() => null),
  ]);
}

export function ensureBankTransferIndexes(): Promise<void> {
  if (!ready) ready = createIndexes().then(() => undefined);
  return ready;
}
