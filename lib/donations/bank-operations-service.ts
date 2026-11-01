import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { bankBalance, bankOperations, bankSale, moneyMinor, validateBankAction, type BankAction, type BankDonation, type BankOperation } from "./bank-operations-core";
import type { BankReply } from "./bank-operations-provider";
import { inspectBankReply } from "./bank-operations-inspection";
import { object } from "./bank-operations-core";

type Database = Pick<PrismaClient, "donation">;
type Actor = { id: string; name: string };
type Call = (donation: BankDonation, action: BankAction | "INQUIRE", operationId: string, amountMinor?: number) => Promise<BankReply>;
const json = (value: unknown) => value as Prisma.InputJsonValue;
export const bankDonationSelect = { id: true, provider: true, providerOrderId: true, providerHostRefNum: true, providerAuthCode: true, providerTxnType: true, providerRaw: true, status: true, paidAt: true, bankOperations: true, bankOperationLock: true, bankOperationsRevision: true, bankLastInquiry: true } as const;
const revisionWhere = (donation: BankDonation): Prisma.DonationWhereInput => donation.bankOperationsRevision == null ? { OR: [{ bankOperationsRevision: null }, { bankOperationsRevision: { isSet: false } }] } : { bankOperationsRevision: donation.bankOperationsRevision };
const lockWhere = (donation: BankDonation): Prisma.DonationWhereInput => donation.bankOperationLock ? { bankOperationLock: donation.bankOperationLock } : { OR: [{ bankOperationLock: null }, { bankOperationLock: { isSet: false } }] };
function inquiryRecord(donation: BankDonation, reply: BankReply, actor: Actor) {
  const sale = bankSale(donation), inspection = inspectBankReply(donation, reply);
  const local = bankOperations(donation.bankOperations).filter(op => op.state === "SUCCEEDED").reduce((n, op) => n + op.amountMinor, 0);
  if (inspection.returnedMinor < local) inspection.verified = false;
  const lastCheck = { ...reply, inspection, at: new Date().toISOString(), actorId: actor.id };
  // A failed read cannot erase a previously verified external refund balance.
  return inspection.verified ? { orderId: sale.orderId, amountMinor: sale.amountMinor, currency: sale.currency, externalReturnedMinor: inspection.returnedMinor - local, ...lastCheck, lastCheck } : { ...object(donation.bankLastInquiry), lastCheck };
}
async function find(db: Database, id: string) {
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
export async function executeBankAdjustment(db: Database, id: string, input: { key: string; action: BankAction; amount?: unknown; currency: string; reason: string }, actor: Actor, call: Call, ensureReady: (donation: BankDonation) => void) {
  const donation = await find(db, id), duplicate = replay(donation, input.key, input.action, input.amount);
  if (input.currency !== bankSale(donation).currency) throw new Error("CURRENCY_MISMATCH");
  if (duplicate) return duplicate;
  validateBankAction(donation, input.action, input.amount); ensureReady(donation);
  const opId = `BKO${randomUUID().replaceAll("-", "").slice(0, 21)}`;
  const claimed = await db.donation.updateMany({ where: { id, AND: [revisionWhere(donation), lockWhere(donation)] }, data: { bankOperationLock: opId } });
  if (claimed.count !== 1) throw new Error("OPERATION_PENDING_REVIEW");
  let fresh: Awaited<ReturnType<typeof find>>, operation: BankOperation, verifiedInquiry: ReturnType<typeof inquiryRecord>;
  try {
    fresh = await find(db, id);
    const raced = replay(fresh, input.key, input.action, input.amount);
    if (raced) { await db.donation.updateMany({ where: { id, bankOperationLock: opId }, data: { bankOperationLock: null } }); return raced; }
    ensureReady(fresh);
    let read: BankReply;
    try { read = await call(fresh, "INQUIRE", `${opId}Q`); } catch { read = { state: "UNKNOWN", code: "PROVIDER_UNREACHABLE" }; }
    verifiedInquiry = inquiryRecord(fresh, read, actor);
    const inspection = verifiedInquiry.lastCheck.inspection;
    if (!inspection.verified) throw new Error("BANK_BALANCE_UNVERIFIED");
    const amountMinor = validateBankAction({ ...fresh, bankLastInquiry: verifiedInquiry, bankOperationLock: null }, input.action, input.amount);
    const now = new Date().toISOString();
    operation = { id: opId, key: input.key, action: input.action, state: "PENDING", amountMinor, beforeReturnedMinor: inspection.returnedMinor, currency: bankSale(fresh).currency, createdAt: now, updatedAt: now, actorId: actor.id, actorName: actor.name, reason: input.reason };
    const saved = await db.donation.updateMany({ where: { id, bankOperationLock: opId }, data: { bankLastInquiry: json(verifiedInquiry), bankOperations: json([...bankOperations(fresh.bankOperations), operation]) } });
    if (saved.count !== 1) throw new Error("STALE_OPERATION");
  } catch (error) {
    await db.donation.updateMany({ where: { id, bankOperationLock: opId }, data: { bankOperationLock: null } });
    throw error;
  }
  // The request has a durable pending entry before any external side effect.
  let reply: BankReply;
  try { reply = await call(fresh, input.action, opId, operation.amountMinor); }
  catch { reply = { state: "UNKNOWN", code: "PROVIDER_UNREACHABLE" }; }
  const finished = { ...operation, state: reply.state, code: reply.code.slice(0, 60), ...(reply.reference ? { reference: reply.reference.slice(0, 150) } : {}), updatedAt: new Date().toISOString() };
  // A persistence failure after a bank approval deliberately retains the lock/PENDING.
  // No subsequent request may resend this financial operation.
  const saved = await db.donation.updateMany({ where: { id, bankOperationLock: opId, AND: [revisionWhere(fresh)] }, data: { bankLastInquiry: json(verifiedInquiry), bankOperationsRevision: (fresh.bankOperationsRevision || 0) + 1, bankOperations: json([...bankOperations(fresh.bankOperations), finished]), ...(reply.state !== "UNKNOWN" ? { bankOperationLock: null } : {}) } });
  if (saved.count !== 1) throw new Error("STALE_OPERATION");
  return finished;
}
export async function inquireBankDonation(db: Database, id: string, actor: Actor, call: Call, ensureReady: (donation: BankDonation) => void) {
  const donation = await find(db, id); ensureReady(donation);
  let reply: BankReply;
  try { reply = await call(donation, "INQUIRE", `BKQ${randomUUID().replaceAll("-", "").slice(0, 21)}`); }
  catch { reply = { state: "UNKNOWN", code: "PROVIDER_UNREACHABLE" }; }
  const inquiry = inquiryRecord(donation, reply, actor);
  const saved = await db.donation.updateMany({ where: { id, AND: [revisionWhere(donation), lockWhere(donation)] }, data: { bankLastInquiry: json(inquiry) } });
  if (saved.count !== 1) throw new Error("STALE_OPERATION");
  return inquiry.lastCheck;
}
/** An uncertain operation cannot be retried. A finance admin records the bank's evidence. */
export async function resolveBankAdjustment(db: Database, id: string, input: { operationId: string; succeeded: boolean; evidence: string }, actor: Actor) {
  const donation = await find(db, id), balance = bankBalance(donation), operation = balance.operations.find(op => op.id === input.operationId);
  if (!operation || donation.bankOperationLock !== operation.id || !["UNKNOWN", "PENDING"].includes(operation.state)) throw new Error("STALE_OPERATION");
  if (Date.now() - Date.parse(operation.createdAt) < 120000) throw new Error("OPERATION_PENDING_REVIEW");
  const inquiry = object(object(donation.bankLastInquiry).lastCheck), inspection = object(inquiry.inspection);
  if (!inquiry.at || Date.parse(String(inquiry.at)) < Date.parse(operation.updatedAt) || inspection.verified !== true || operation.beforeReturnedMinor == null) throw new Error("BANK_BALANCE_UNVERIFIED");
  const expected = operation.beforeReturnedMinor + (input.succeeded ? operation.amountMinor : 0);
  if (inspection.returnedMinor !== expected || operation.action === "VOID" && input.succeeded && !inspection.voided) throw new Error("BANK_BALANCE_MISMATCH");
  const now = new Date().toISOString();
  const resolved: BankOperation = { ...operation, state: input.succeeded ? "SUCCEEDED" : "DECLINED", updatedAt: now, resolution: { actorId: actor.id, at: now, evidence: input.evidence } };
  const operations = balance.operations.map(op => op.id === operation.id ? resolved : op);
  const local = operations.filter(op => op.state === "SUCCEEDED").reduce((n, op) => n + op.amountMinor, 0);
  const bankLastInquiry = { ...object(donation.bankLastInquiry), externalReturnedMinor: expected - local };
  if (expected < local) throw new Error("BANK_BALANCE_MISMATCH");
  const saved = await db.donation.updateMany({ where: { id, bankOperationLock: operation.id, AND: [revisionWhere(donation)], bankOperations: { equals: json(balance.operations) } }, data: { bankLastInquiry: json(bankLastInquiry), bankOperationsRevision: (donation.bankOperationsRevision || 0) + 1, bankOperations: json(operations), bankOperationLock: null } });
  if (saved.count !== 1) throw new Error("STALE_OPERATION");
  return resolved;
}
