import test from "node:test";
import assert from "node:assert/strict";
import { bankBalance, bankSale, moneyMinor, validateBankAction, type BankDonation } from "../../lib/donations/bank-operations-core";
import { albarakaBankBody, parsePayForBankReply, payForBankFields, callBankOperation } from "../../lib/donations/bank-operations-provider";
import { executeBankAdjustment, inquireBankDonation, resolveBankAdjustment } from "../../lib/donations/bank-operations-service";
import { isAlbarakaApproved, type AlbarakaConfig } from "../../lib/albaraka";
const id = "1".repeat(24), actor = { id: "2".repeat(24), name: "Finance Admin" };
const donation = (provider = "ALBARAKA"): BankDonation => ({ id, provider, providerOrderId: "A".repeat(24), providerHostRefNum: "123456789012345678", providerTxnType: "Sale", status: "PAID", paidAt: new Date(), providerRaw: provider === "ALBARAKA" ? { albarakaRequest: { orderId: "A".repeat(24), amount: 1000, currencyCode: "EU", mode: "2D" } } : { payforRequest: { orderId: "A".repeat(24), purchAmount: "10.00", currency: "978" } } });
const approved = async () => ({ state: "SUCCEEDED" as const, code: "00", reference: "TEST-RETURN" });
const ready = () => {};
const cfg: AlbarakaConfig = { merchantNo: "merchant", terminalNo: "terminal", posnetId: "posnet", encKey: "test-key", tdsUrl: "https://bank.invalid/3d", serviceUrl: "https://bank.invalid/api", useOOS: false, useJokerVadaa: false };
function fixture() {
  const row = donation(); let failFinal = false;
  const matches = (where: Record<string, unknown>) => (!where.bankOperationLock || row.bankOperationLock === where.bankOperationLock) && (!where.OR || !row.bankOperationLock) && (!where.bankOperations || JSON.stringify(row.bankOperations) === JSON.stringify((where.bankOperations as { equals: unknown }).equals));
  const db = { donation: {
    async findUnique() { return structuredClone(row); },
    async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) { if (!matches(where)) return { count: 0 }; if (failFinal && data.bankOperations && JSON.stringify(data.bankOperations).includes('"state":"SUCCEEDED"')) throw new Error("write failed"); Object.assign(row, structuredClone(data)); return { count: 1 }; },
    async update({ data }: { data: Record<string, unknown> }) { Object.assign(row, structuredClone(data)); return row; },
  }, async $transaction<T>(fn: (tx: unknown) => Promise<T>) { const old = structuredClone(row); try { return await fn(db); } catch (error) { Object.assign(row, old); throw error; } } };
  return { row, db: db as unknown as Parameters<typeof executeBankAdjustment>[0], failFinal: () => { failFinal = true; } };
}
for (const value of ["0", "-1", "1.001", "1e2", "NaN", "Infinity", "", "1,00", 0.1 + 0.2]) test(`money rejects ambiguous amount ${value}`, () => assert.throws(() => moneyMinor(value)));
test("minor amounts preserve cents exactly", () => { assert.equal(moneyMinor("7.01"), 701); assert.equal(moneyMinor(0.29), 29); });
test("refund and inquiry select the original bank currency and 3D order prefix", () => {
  const row = donation(); row.providerHostRefNum = null; row.providerOrderId = "A".repeat(20); row.providerRaw = { albarakaRequest: { orderId: row.providerOrderId, amount: 1000, currencyCode: "EU", mode: "3D" } };
  const refund = albarakaBankBody(row, cfg, "REFUND", 375); assert.equal(refund.OrderId, "TDS_" + row.providerOrderId); assert.equal(refund.Amount, "375"); assert.equal(refund.CurrencyCode, "EU");
  assert.equal(albarakaBankBody(row, cfg, "INQUIRE").OrderId, "TDS_" + row.providerOrderId);
});
test("reference-based reversals omit the original order from the MAC and body", () => { const body = albarakaBankBody(donation(), cfg, "VOID"); assert.equal(body.ReferenceCode, "123456789012345678"); assert.equal(body.OrderId, null); assert.ok(!("Amount" in body)); });
test("PayFor uses documented secondary operation fields without card data or MerchantPass", () => { const fields = payForBankFields(donation("PAYFOR"), "REFUND", "REFUND-ID", 305); assert.equal(fields.OrgOrderId, "A".repeat(24)); assert.equal(fields.PurchAmount, "3.05"); assert.equal(fields.TxnType, "Refund"); assert.equal(fields.SecureType, "NonSecure"); assert.ok(!("Pan" in fields)); assert.ok(!("MerchantPass" in fields)); });
test("bank response parsing excludes card data and rejects duplicate identities and XML entities", () => {
  assert.deepEqual(parsePayForBankReply('<Reply><ProcReturnCode>00</ProcReturnCode><OrderId>TEST</OrderId><Pan>4242424242424242</Pan></Reply>'), { OrderId: "TEST", ProcReturnCode: "00" });
  assert.deepEqual(parsePayForBankReply('<Reply><OrderId>A</OrderId><OrderId>B</OrderId></Reply>'), {});
  assert.deepEqual(parsePayForBankReply('<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><Reply/>'), {});
});
test("incomplete or changed sale snapshots cannot cause a bank call", () => { const row = donation(); row.providerRaw = {}; assert.throws(() => bankSale(row)); row.providerRaw = { albarakaRequest: { orderId: "different", amount: 1000, currencyCode: "EU" } }; assert.throws(() => bankBalance(row)); });
test("unpaid donations cannot be refunded", () => { const row = donation(); row.paidAt = null; assert.throws(() => validateBankAction(row, "REFUND", "1"), /CONFIRMED_SALE_REQUIRED/); });
test("partial and repeated refunds consume the remaining balance and preserve the original donation", async () => {
  const f = fixture(); let calls = 0; const call = async () => { calls++; return approved(); };
  await executeBankAdjustment(f.db, id, { key: "first", action: "REFUND", amount: "3.01", reason: "Requested by donor" }, actor, call, ready);
  assert.equal(bankBalance(f.row).remainingMinor, 699);
  await assert.rejects(executeBankAdjustment(f.db, id, { key: "too-much", action: "REFUND", amount: "7", reason: "Donor request" }, actor, call, ready), /AMOUNT_EXCEEDS_REMAINING/);
  await executeBankAdjustment(f.db, id, { key: "second", action: "REFUND", amount: "6.99", reason: "Remaining amount" }, actor, call, ready);
  assert.equal(bankBalance(f.row).remainingMinor, 0); assert.equal(calls, 2); assert.equal(f.row.status, "PAID"); assert.ok(f.row.paidAt);
});
test("same idempotency key replays only the recorded result and rejects changed amounts", async () => {
  const f = fixture(); let calls = 0; const input = { key: "same", action: "REFUND" as const, amount: "2", reason: "Donor request" };
  const first = await executeBankAdjustment(f.db, id, input, actor, async () => { calls++; return approved(); }, ready);
  const again = await executeBankAdjustment(f.db, id, input, actor, approved, () => { throw new Error("not called on replay"); });
  assert.equal(first.id, again.id); assert.equal(calls, 1);
  await assert.rejects(executeBankAdjustment(f.db, id, { ...input, amount: "3" }, actor, approved, ready), /IDEMPOTENCY_CONFLICT/);
});
test("a concurrent refund is blocked while the first request is in flight", async () => {
  const f = fixture(); let finish!: () => void, entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; }); const wait = new Promise<void>(resolve => { finish = resolve; });
  const first = executeBankAdjustment(f.db, id, { key: "first", action: "REFUND", amount: "6", reason: "Donor request" }, actor, async () => { entered(); await wait; return approved(); }, ready);
  await started; await assert.rejects(executeBankAdjustment(f.db, id, { key: "second", action: "REFUND", amount: "6", reason: "Second request" }, actor, approved, ready), /OPERATION_PENDING_REVIEW/); finish(); await first; assert.equal(bankBalance(f.row).remainingMinor, 400);
});
test("unknown provider outcome stays locked and never becomes an automatic retry", async () => { const f = fixture(); const result = await executeBankAdjustment(f.db, id, { key: "lost", action: "REFUND", amount: "4", reason: "Donor request" }, actor, async () => { throw new Error("timeout"); }, ready); assert.equal(result.state, "UNKNOWN"); assert.ok(f.row.bankOperationLock); await assert.rejects(executeBankAdjustment(f.db, id, { key: "retry", action: "REFUND", amount: "4", reason: "Donor request" }, actor, approved, ready), /OPERATION_PENDING_REVIEW/); });
test("a final DB failure after bank approval leaves a pending entry and a durable lock", async () => { const f = fixture(); f.failFinal(); await assert.rejects(executeBankAdjustment(f.db, id, { key: "db-fail", action: "REFUND", amount: "4", reason: "Donor request" }, actor, approved, ready)); assert.ok(f.row.bankOperationLock); assert.equal(bankBalance(f.row).operations[0].state, "PENDING"); });
test("a bank decline consumes no money and never falls back from void to refund", async () => { const f = fixture(); let calls = 0; await executeBankAdjustment(f.db, id, { key: "void", action: "VOID", reason: "Donor request" }, actor, async (_row, action) => { calls++; assert.equal(action, "VOID"); return { state: "DECLINED", code: "99" }; }, ready); assert.equal(calls, 1); assert.equal(bankBalance(f.row).remainingMinor, 1000); assert.equal(f.row.bankOperationLock, null); });
test("a successful void exhausts the balance and prevents any later refund", async () => { const f = fixture(); await executeBankAdjustment(f.db, id, { key: "void", action: "VOID", reason: "Donor request" }, actor, approved, ready); assert.equal(bankBalance(f.row).remainingMinor, 0); assert.equal(bankBalance(f.row).voided, true); await assert.rejects(executeBankAdjustment(f.db, id, { key: "refund", action: "REFUND", amount: "1", reason: "Donor request" }, actor, approved, ready), /NOTHING_TO_RETURN/); });
test("manual matching requires a newer bank inquiry and records evidence without resending money", async () => {
  const f = fixture(); await executeBankAdjustment(f.db, id, { key: "unknown", action: "REFUND", amount: "2", reason: "Donor request" }, actor, async () => ({ state: "UNKNOWN", code: "TIMEOUT" }), ready);
  const op = bankBalance(f.row).operations[0]; op.createdAt = new Date(Date.now() - 180000).toISOString(); f.row.bankOperations = [op];
  await assert.rejects(resolveBankAdjustment(f.db, id, { operationId: op.id, succeeded: true, evidence: "Bank reference TEST-123" }, actor), /STALE_OPERATION/);
  await inquireBankDonation(f.db, id, actor, approved, ready);
  const resolved = await resolveBankAdjustment(f.db, id, { operationId: op.id, succeeded: true, evidence: "Bank reference TEST-123" }, actor);
  assert.equal(resolved.state, "SUCCEEDED"); assert.equal(bankBalance(f.row).remainingMinor, 800); assert.equal(f.row.bankOperationLock, null);
});
test("PayFor rejects approvals for a different original order", async () => {
  const saved = { ...process.env }, originalFetch = global.fetch;
  Object.assign(process.env, { PAYFOR_API_URL: "https://bank.invalid/api", PAYFOR_API_FORMAT: "FORM", PAYFOR_MBR_ID: "1", PAYFOR_MERCHANT_ID: "2", PAYFOR_USER_CODE: "3", PAYFOR_USER_PASS: "test-not-real" });
  global.fetch = async () => new Response(JSON.stringify({ ProcReturnCode: "00", OrderId: "FOREIGN", OrgOrderId: "FOREIGN" }));
  try { assert.equal((await callBankOperation(donation("PAYFOR"), "REFUND", "OUR-REFUND", 100)).state, "UNKNOWN"); }
  finally { global.fetch = originalFetch; process.env = saved; }
});

test("a transport failure cannot be treated as a bank approval", () => { assert.equal(isAlbarakaApproved({ TransportFailure: true, ServiceResponseData: { ResponseCode: "00" } }), false); });
test("PayFor query responses support semicolon separators but never duplicate response codes", () => {
  assert.deepEqual(parsePayForBankReply("ProcReturnCode=00;;OrderId=TEST;;Pan=4242424242424242"), { OrderId: "TEST", ProcReturnCode: "00" });
  assert.deepEqual(parsePayForBankReply("ProcReturnCode=00&ProcReturnCode=99&OrderId=TEST"), {});
});
