import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { bankBalance, bankOperations, bankSale, moneyMinor, validateBankAction, type BankAction, type BankDonation, type BankOperation } from "./bank-operations-core";
import type { BankReply } from "./bank-operations-provider";

type Reader = Pick<Prisma.TransactionClient, "donation">;
type Database = Pick<PrismaClient, "donation" | "$transaction">;
type Actor = { id: string; name: string };
type Call = (donation: BankDonation, action: BankAction | "INQUIRE", operationId: string, amountMinor?: number) => Promise<BankReply>;
const json = (value: unknown) => value as Prisma.InputJsonValue;
export const bankDonationSelect = { id: true, provider: true, providerOrderId: true, providerHostRefNum: true, providerTxnType: true, providerRaw: true, status: true, paidAt: true, bankOperations: true, bankOperationLock: true, bankLastInquiry: true } as const;
async function find(db: Reader, id: string) {
  const donation = await db.donation.findUnique({ where: { id }, select: bankDonationSelect });
  if (!donation) throw new Error("NOT_FOUND");
  return donation;
}
function replay(donation: BankDonation, key: string, action: BankAction, amount: unknown) {
  const old = bankOperations(donation.bankOperations).find(op => op.key === key);
  if (!old) return null;
  const expected = action === "VOID" ? bankSale(donation).amountMinor : moneyMinor(amount);
  if (old.action !== action || old.amountMinor !== expected) throw new Error("IDEMPOTENCY_CONFLICT");
  return old;
}
export async function executeBankAdjustment(db: Database, id: string, input: { key: string; action: BankAction; amount?: unknown; reason: string }, actor: Actor, call: Call, ensureReady: (donation: BankDonation) => void) {
  const donation = await find(db, id), duplicate = replay(donation, input.key, input.action, input.amount);
  if (duplicate) return duplicate;
  validateBankAction(donation, input.action, input.amount); ensureReady(donation);
  const opId = `BKO${randomUUID().replaceAll("-", "").slice(0, 21)}`;
  const started = await db.$transaction(async tx => {
    const claimed = await tx.donation.updateMany({ where: { id, OR: [{ bankOperationLock: null }, { bankOperationLock: { isSet: false } }] }, data: { bankOperationLock: opId } });
    if (claimed.count !== 1) throw new Error("OPERATION_PENDING_REVIEW");
    const fresh = await find(tx, id);
    const raced = replay(fresh, input.key, input.action, input.amount);
    if (raced) { await tx.donation.update({ where: { id }, data: { bankOperationLock: null } }); return { fresh, operation: raced, replayed: true }; }
    const amountMinor = validateBankAction({ ...fresh, bankOperationLock: null }, input.action, input.amount);
    ensureReady(fresh);
    const now = new Date().toISOString();
    const operation: BankOperation = { id: opId, key: input.key, action: input.action, state: "PENDING", amountMinor, currency: bankSale(fresh).currency, createdAt: now, updatedAt: now, actorId: actor.id, actorName: actor.name, reason: input.reason };
    await tx.donation.update({ where: { id }, data: { bankOperations: json([...bankOperations(fresh.bankOperations), operation]) } });
    return { fresh, operation, replayed: false };
  });
  const { fresh, operation } = started;
  if (started.replayed) return operation;
  // The request has a durable pending entry before any external side effect.
  let reply: BankReply;
  try { reply = await call(fresh, input.action, opId, operation.amountMinor); }
  catch { reply = { state: "UNKNOWN", code: "PROVIDER_UNREACHABLE" }; }
  const finished = { ...operation, state: reply.state, code: reply.code.slice(0, 60), ...(reply.reference ? { reference: reply.reference.slice(0, 150) } : {}), updatedAt: new Date().toISOString() };
  // A persistence failure after a bank approval deliberately retains the lock/PENDING.
  // No subsequent request may resend this financial operation.
  const saved = await db.donation.updateMany({ where: { id, bankOperationLock: opId }, data: { bankOperations: json([...bankOperations(fresh.bankOperations), finished]), ...(reply.state !== "UNKNOWN" ? { bankOperationLock: null } : {}) } });
  if (saved.count !== 1) throw new Error("STALE_OPERATION");
  return finished;
}
export async function inquireBankDonation(db: Database, id: string, actor: Actor, call: Call, ensureReady: (donation: BankDonation) => void) {
  const donation = await find(db, id); ensureReady(donation);
  let reply: BankReply;
  try { reply = await call(donation, "INQUIRE", `BKQ${randomUUID().replaceAll("-", "").slice(0, 21)}`); }
  catch { reply = { state: "UNKNOWN", code: "PROVIDER_UNREACHABLE" }; }
  const inquiry = { ...reply, at: new Date().toISOString(), actorId: actor.id };
  await db.donation.update({ where: { id }, data: { bankLastInquiry: json(inquiry) } });
  return inquiry;
}
/** An uncertain operation cannot be retried. A finance admin records the bank's evidence. */
export async function resolveBankAdjustment(db: Database, id: string, input: { operationId: string; succeeded: boolean; evidence: string }, actor: Actor) {
  const donation = await find(db, id), balance = bankBalance(donation), operation = balance.operations.find(op => op.id === input.operationId);
  if (!operation || donation.bankOperationLock !== operation.id || !["UNKNOWN", "PENDING"].includes(operation.state)) throw new Error("STALE_OPERATION");
  if (Date.now() - Date.parse(operation.createdAt) < 120000) throw new Error("OPERATION_PENDING_REVIEW");
  const inquiry = donation.bankLastInquiry as { at?: string } | null;
  if (!inquiry?.at || Date.parse(inquiry.at) < Date.parse(operation.createdAt)) throw new Error("STALE_OPERATION");
  if (input.succeeded && operation.amountMinor > balance.remainingMinor) throw new Error("AMOUNT_EXCEEDS_REMAINING");
  const now = new Date().toISOString();
  const resolved: BankOperation = { ...operation, state: input.succeeded ? "SUCCEEDED" : "DECLINED", updatedAt: now, resolution: { actorId: actor.id, at: now, evidence: input.evidence } };
  const saved = await db.donation.updateMany({ where: { id, bankOperationLock: operation.id, bankOperations: { equals: json(balance.operations) } }, data: { bankOperations: json(balance.operations.map(op => op.id === operation.id ? resolved : op)), bankOperationLock: null } });
  if (saved.count !== 1) throw new Error("STALE_OPERATION");
  return resolved;
}
