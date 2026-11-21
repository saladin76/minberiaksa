import test from "node:test";
import assert from "node:assert/strict";
import { bankBalance, moneyMinor, type BankDonation } from "../../lib/donations/bank-operations-core";
import { inspectBankReply } from "../../lib/donations/bank-operations-inspection";
import { albarakaBankBody, parsePayForBankReply, payForBankFields, payForOperationsConfig, payForResponseBelongsToSale, callBankOperation, type BankReply } from "../../lib/donations/bank-operations-provider";
import { executeBankAdjustment, inquireBankDonation, resolveBankAdjustment } from "../../lib/donations/bank-operations-service";
import type { AlbarakaConfig } from "../../lib/albaraka";
const id = "1".repeat(24), actor = { id: "2".repeat(24), name: "Finance Admin" };
const donation = (provider = "ALBARAKA"): BankDonation => ({ id, provider, providerOrderId: "A".repeat(24), providerHostRefNum: "123456789012345678", providerAuthCode: "123456", providerTxnType: "Sale", status: "PAID", paidAt: new Date(), providerRaw: provider === "ALBARAKA" ? { albarakaRequest: { orderId: "A".repeat(24), amount: 1000, currencyCode: "EU", mode: "2D" } } : { payforRequest: { orderId: "A".repeat(24), purchAmount: "10.00", currency: "978" } } });
const cfg: AlbarakaConfig = { merchantNo: "merchant", terminalNo: "terminal", posnetId: "posnet", encKey: "test-key", tdsUrl: "https://bank.invalid/3d", serviceUrl: "https://bank.invalid/api", useOOS: false, useJokerVadaa: false };
const input = (amount = "2", key = "first") => ({ key, action: "REFUND" as const, amount, currency: "EUR", reason: "Requested by donor" });
function fixture() {
  const row = donation(), bank = { returned: 0, voided: false, financialCalls: 0, inquiries: 0, outcome: "SUCCEEDED" as BankReply["state"], missingBalance: false };
  let failFinal = false, failReservation = false;
  const matches = (where: Record<string, unknown>): boolean => Object.entries(where).every(([key, expected]) => {
    if (key === "AND") return (expected as Record<string, unknown>[]).every(matches);
    if (key === "OR") return (expected as Record<string, unknown>[]).some(matches);
    const value = row[key as keyof BankDonation];
    if (expected === null) return value == null;
    if (expected && typeof expected === "object") {
      if ("isSet" in expected) return (value !== undefined) === expected.isSet;
      if ("equals" in expected) return JSON.stringify(value) === JSON.stringify(expected.equals);
    }
    return value === expected;
  });
  const db = { donation: {
    async findUnique() { return structuredClone(row); },
    async updateMany({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) {
      if (!matches(where)) return { count: 0 };
      if (data.bankOperations && ((failFinal && JSON.stringify(data.bankOperations).includes('"state":"SUCCEEDED"')) || (failReservation && JSON.stringify(data.bankOperations).includes('"state":"PENDING"')))) throw new Error("write failed");
      Object.assign(row, structuredClone(data)); return { count: 1 };
    },
  } };
  const call = async (_row: BankDonation, action: "INQUIRE" | "REFUND" | "VOID", _operationId: string, amount?: number): Promise<BankReply> => {
    if (action === "INQUIRE") {
      bank.inquiries++;
      const transactions = [{ OrderId: row.providerOrderId!, Amount: "10.00", CurrencyCode: "EU", TransactionType: "Sale", AuthCode: "123456" }, ...(bank.returned ? [{ OrderId: row.providerOrderId!, Amount: (bank.returned / 100).toFixed(2), CurrencyCode: "EU", TransactionType: bank.voided ? "Void" : "Return", AuthCode: "123456" }] : [])];
      return { state: "SUCCEEDED", code: "0000", data: bank.missingBalance ? {} : { transactions } };
    }
    bank.financialCalls++;
    if (bank.outcome === "SUCCEEDED") { bank.returned += amount!; bank.voided = action === "VOID"; }
    return { state: bank.outcome, code: bank.outcome === "SUCCEEDED" ? "00" : bank.outcome === "DECLINED" ? "99" : "TIMEOUT", reference: "RETURN-TEST" };
  };
  const ready = () => {};
  const database = db as unknown as Parameters<typeof executeBankAdjustment>[0];
  return { row, bank, call, ready, db: database, run: (data: Parameters<typeof executeBankAdjustment>[2] = input()) => executeBankAdjustment(database, id, data, actor, call, ready), failFinal: () => { failFinal = true; }, failReservation: () => { failReservation = true; } };
}
for (const value of ["0", "-1", "1.001", "1e2", "NaN", "Infinity", "", "1,00", 0.1 + 0.2]) test(`money rejects ambiguous amount ${value}`, () => assert.throws(() => moneyMinor(value)));
test("minor amounts preserve cents exactly", () => { assert.equal(moneyMinor("7.01"), 701); assert.equal(moneyMinor(0.29), 29); });
test("Albaraka follows the documented original currency, MAC and 3D order prefix", () => {
  const row = donation(); row.providerHostRefNum = null; row.providerOrderId = "A".repeat(20); row.providerRaw = { albarakaRequest: { orderId: row.providerOrderId, amount: 1000, currencyCode: "EU" } };
  const refund = albarakaBankBody(row, cfg, "REFUND", 375); assert.equal(refund.OrderId, "TDS_" + row.providerOrderId); assert.equal(refund.Amount, "375"); assert.equal(refund.CurrencyCode, "EU");
  assert.equal(albarakaBankBody(row, cfg, "INQUIRE").OrderId, "TDS_" + row.providerOrderId);
  const reverse = albarakaBankBody(donation(), cfg, "VOID"); assert.equal(reverse.ReferenceCode, "123456789012345678"); assert.equal(reverse.OrderId, null); assert.equal(reverse.MACParams, "MerchantNo:TerminalNo:ReferenceCode:OrderId"); assert.ok(!("Amount" in reverse));
});
test("PayFor secondary requests contain no card data or 3D password", () => { const fields = payForBankFields(donation("PAYFOR"), "REFUND", "REFUND-ID", 305); assert.equal(fields.OrgOrderId, "A".repeat(24)); assert.equal(fields.PurchAmount, "3.05"); assert.equal(fields.TxnType, "Refund"); assert.equal(fields.SecureType, "NonSecure"); assert.ok(!("Pan" in fields)); assert.ok(!("MerchantPass" in fields)); });
test("PayFor API request matches the bank integration guide for inquiry, void and refund", () => {
  const sale = donation("PAYFOR");
  const inquiry = payForBankFields(sale, "INQUIRE", "LOCAL-Q");
  assert.deepEqual(Object.keys(inquiry).sort(), ["MbrId", "MerchantID", "UserCode", "UserPass", "OrderId", "SecureType", "TxnType", "Currency", "Lang"].sort());
  assert.equal(inquiry.OrderId, sale.providerOrderId);
  assert.equal(inquiry.SecureType, "Inquiry");
  assert.equal(inquiry.TxnType, "OrderInquiry");
  const voidFields = payForBankFields(sale, "VOID", "LOCAL-V");
  assert.deepEqual(Object.keys(voidFields).sort(), ["MbrId", "MerchantID", "UserCode", "UserPass", "OrgOrderId", "SecureType", "TxnType", "Currency", "Lang"].sort());
  assert.equal(voidFields.OrgOrderId, sale.providerOrderId);
  assert.equal(voidFields.TxnType, "Void");
  assert.ok(!("PurchAmount" in voidFields));
  assert.ok(!("OrderId" in voidFields), "the bank does not document a new adjustment OrderId");
  const refund = payForBankFields(sale, "REFUND", "LOCAL-R", 305);
  assert.equal(refund.OrgOrderId, sale.providerOrderId);
  assert.equal(refund.PurchAmount, "3.05");
  assert.equal(refund.SecureType, "NonSecure");
  assert.ok(!("OrderId" in refund));
  for (const amount of [undefined, 0, -1, 1001, 0.25, Number.NaN]) assert.throws(() => payForBankFields(sale, "REFUND", "LOCAL-R", amount), /INVALID_AMOUNT/);
});

test("PayFor secondary reply requires identity of the original sale, not just arbitrary adjustment ID", () => {
  const order = "A".repeat(24);
  assert.equal(payForResponseBelongsToSale({ OrgOrderId: order, OrderId: "OTHER" }, order, "REFUND"), true);
  assert.equal(payForResponseBelongsToSale({ OrderId: order }, order, "VOID"), true);
  assert.equal(payForResponseBelongsToSale({ OrderId: "LOCAL-R" }, order, "REFUND"), false);
  assert.equal(payForResponseBelongsToSale({ OrgOrderId: "FOREIGN", OrderId: order }, order, "REFUND"), false);
  assert.equal(payForResponseBelongsToSale({ OrderId: order }, order, "INQUIRE"), true);
  assert.equal(payForResponseBelongsToSale({ OrderId: "FOREIGN" }, order, "INQUIRE"), false);
});

test("PayFor nonfinal/error status codes never authorize another automatic money attempt", async () => {
  const saved = { ...process.env }, originalFetch = global.fetch;
  Object.assign(process.env, { PAYFOR_API_URL: "https://bank.invalid/api", PAYFOR_API_FORMAT: "FORM", PAYFOR_MBR_ID: "1", PAYFOR_MERCHANT_ID: "2", PAYFOR_USER_CODE: "3", PAYFOR_USER_PASS: "test-not-real" });
  const sale = donation("PAYFOR");
  try {
    for (const code of ["V000", "V020", "V036", "V9196", "V9199", "91", "96", "M61"]) {
      global.fetch = async () => new Response(JSON.stringify({ ProcReturnCode: code, OrderId: sale.providerOrderId, OrgOrderId: sale.providerOrderId, TxnType: "Refund", Currency: "978", PurchAmount: "1.00", TxnResult: "Failed" }));
      const result = await callBankOperation(sale, "REFUND", "LOCAL-R", 100);
      assert.equal(result.state, "UNKNOWN", code);
    }
    global.fetch = async () => new Response(JSON.stringify({ ProcReturnCode: "00", OrgOrderId: sale.providerOrderId, TxnType: "Refund", Currency: "978", PurchAmount: "1.00", TxnResult: "Success" }));
    assert.equal((await callBankOperation(sale, "REFUND", "LOCAL-R", 100)).state, "SUCCEEDED");
    global.fetch = async () => new Response(JSON.stringify({ ProcReturnCode: "00", OrderId: "LOCAL-R", TxnType: "Refund", Currency: "978", PurchAmount: "1.00", TxnResult: "Success" }));
    assert.equal((await callBankOperation(sale, "REFUND", "LOCAL-R", 100)).state, "UNKNOWN");
  } finally { global.fetch = originalFetch; process.env = saved; }
});

test("the XML boundary rejects malformed, duplicate, nested and entity payloads and strips secrets", () => {
  assert.deepEqual(parsePayForBankReply('<Reply><ProcReturnCode>00</ProcReturnCode><OrderId>TEST</OrderId><Pan>4242424242424242</Pan><UserPass>secret</UserPass></Reply>'), { ProcReturnCode: "00", OrderId: "TEST" });
  for (const xml of ['<Reply><OrderId>A</OrderId><OrderId>B</OrderId></Reply>', '<Reply><OrderId>A</OrderId>', '<Reply><OrderId><Nested>A</Nested></OrderId></Reply>', '<!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><Reply/>', 'OrderId=A&OrderId=B&ProcReturnCode=00']) assert.deepEqual(parsePayForBankReply(xml), {});
});
test("only an exact original sale and complete bank refund balance authorize financial operations", async () => {
  const f = fixture(), reply = await f.call(f.row, "INQUIRE", "test"); assert.equal(inspectBankReply(f.row, reply).verified, true);
  for (const patch of [{ OrderId: "FOREIGN" }, { Amount: "11.00" }, { CurrencyCode: "US" }, { AuthCode: "FOREIGN" }, { TransactionType: "Auth" }]) {
    const altered = structuredClone(reply); Object.assign((altered.data!.transactions as Record<string, unknown>[])[0], patch); assert.equal(inspectBankReply(f.row, altered).verified, false);
  }
  const payfor = donation("PAYFOR"), data = { OrderId: payfor.providerOrderId, PurchAmount: "10.00", Currency: "978", AuthCode: "123456", RefundedAmount: "3.00" };
  assert.equal(inspectBankReply(payfor, { state: "SUCCEEDED", code: "00", data }).returnedMinor, 300);
  assert.equal(inspectBankReply(payfor, { state: "SUCCEEDED", code: "00", data: { ...data, RefundedAmount: "" } }).verified, false);
});
test("unpaid, incomplete, wrong-currency or unverified sales never send an adjustment", async () => {
  for (const change of ["unpaid", "snapshot", "currency", "inquiry"]) {
    const f = fixture(); if (change === "unpaid") f.row.paidAt = null; if (change === "snapshot") f.row.providerRaw = {}; if (change === "inquiry") f.bank.missingBalance = true;
    await assert.rejects(f.run({ ...input(), currency: change === "currency" ? "USD" : "EUR" })); assert.equal(f.bank.financialCalls, 0); assert.equal(bankOperationsCount(f.row), 0);
  }
});
function bankOperationsCount(row: BankDonation) { return Array.isArray(row.bankOperations) ? row.bankOperations.length : 0; }
test("partial and repeated refunds consume the bank-verified balance and preserve the original sale", async () => {
  const f = fixture(); await f.run(input("3.01")); assert.equal(bankBalance(f.row).remainingMinor, 699);
  await assert.rejects(f.run(input("7", "too-much")), /AMOUNT_EXCEEDS_REMAINING/);
  await f.run(input("6.99", "second")); assert.equal(bankBalance(f.row).remainingMinor, 0); assert.equal(f.bank.financialCalls, 2); assert.equal(f.row.status, "PAID"); assert.ok(f.row.paidAt);
});
test("refunds made outside this dashboard reduce availability without inventing ledger entries", async () => {
  const f = fixture(); f.bank.returned = 300;
  await assert.rejects(f.run(input("8")), /AMOUNT_EXCEEDS_REMAINING/); assert.equal(f.bank.financialCalls, 0);
  await f.run(input("2")); assert.equal(bankBalance(f.row).remainingMinor, 500); assert.equal(bankBalance(f.row).externalReturnedMinor, 300); assert.equal(bankOperationsCount(f.row), 1);
  await f.run(input("5", "second")); assert.equal(bankBalance(f.row).remainingMinor, 0); assert.equal(f.bank.returned, 1000);
});
test("same key replays only its result, while a changed amount or currency cannot reuse it", async () => {
  const f = fixture(), first = await f.run(), again = await f.run(); assert.equal(first.id, again.id); assert.equal(f.bank.financialCalls, 1);
  await assert.rejects(f.run(input("3")), /IDEMPOTENCY_CONFLICT/); await assert.rejects(f.run({ ...input(), currency: "TRY" }), /CURRENCY_MISMATCH/);
});
test("an operation in flight blocks concurrent refunds, including clients with another request key", async () => {
  const f = fixture(); let finish!: () => void, entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; }), wait = new Promise<void>(resolve => { finish = resolve; });
  const first = executeBankAdjustment(f.db, id, input("6"), actor, async (...args) => { if (args[1] !== "INQUIRE") { entered(); await wait; } return f.call(...args); }, f.ready);
  await started; await assert.rejects(f.run(input("6", "second")), /OPERATION_PENDING_REVIEW/); finish(); await first; assert.equal(f.bank.financialCalls, 1); assert.equal(bankBalance(f.row).remainingMinor, 400);
});
test("a lost bank response retains a durable unknown record and never triggers an automatic resend", async () => {
  const f = fixture(); f.bank.outcome = "UNKNOWN"; assert.equal((await f.run()).state, "UNKNOWN"); assert.ok(f.row.bankOperationLock);
  await assert.rejects(f.run(input("2", "retry")), /OPERATION_PENDING_REVIEW/); assert.equal((await f.run()).state, "UNKNOWN"); assert.equal(f.bank.financialCalls, 1);
});
test("reservation failure cannot call the bank; post-approval persistence failure retains the pending lock", async () => {
  const before = fixture(); before.failReservation(); await assert.rejects(before.run()); assert.equal(before.bank.financialCalls, 0); assert.equal(bankOperationsCount(before.row), 0);
  const after = fixture(); after.failFinal(); await assert.rejects(after.run()); assert.equal(after.bank.financialCalls, 1); assert.ok(after.row.bankOperationLock); assert.equal(bankBalance(after.row).operations[0].state, "PENDING");
});
test("void never silently falls back to a refund and can exhaust only an unrefunded original sale", async () => {
  const f = fixture(), request = { ...input(), action: "VOID" as const }; f.bank.outcome = "DECLINED"; await f.run(request); assert.equal(f.bank.financialCalls, 1); assert.equal(bankBalance(f.row).remainingMinor, 1000);
  f.bank.outcome = "SUCCEEDED"; await f.run({ ...request, key: "second" }); assert.equal(bankBalance(f.row).voided, true); assert.equal(bankBalance(f.row).remainingMinor, 0); await assert.rejects(f.run(input("1", "refund")), /NOTHING_TO_RETURN/);
});
test("manual resolution needs a fresh verified balance matching the selected result and never sends money", async () => {
  const f = fixture(); f.bank.outcome = "UNKNOWN"; await f.run();
  const op = bankBalance(f.row).operations[0]; op.createdAt = new Date(Date.now() - 180000).toISOString(); op.updatedAt = op.createdAt; f.row.bankOperations = [op]; f.row.bankLastInquiry = null;
  const request = { operationId: op.id, succeeded: true, evidence: "Bank reference TEST-123 confirms this refund" };
  await assert.rejects(resolveBankAdjustment(f.db, id, request, actor), /BANK_BALANCE_UNVERIFIED/);
  await inquireBankDonation(f.db, id, actor, f.call, f.ready); await assert.rejects(resolveBankAdjustment(f.db, id, request, actor), /BANK_BALANCE_MISMATCH/);
  f.bank.returned = 200; await inquireBankDonation(f.db, id, actor, f.call, f.ready); const result = await resolveBankAdjustment(f.db, id, request, actor);
  assert.equal(result.state, "SUCCEEDED"); assert.equal(bankBalance(f.row).remainingMinor, 800); assert.equal(f.row.bankOperationLock, null); assert.equal(f.bank.financialCalls, 1);
});
test("a failed or stale inquiry cannot erase a verified external balance", async () => {
  const f = fixture(); f.bank.returned = 300; await inquireBankDonation(f.db, id, actor, f.call, f.ready); assert.equal(bankBalance(f.row).returnedMinor, 300);
  f.bank.missingBalance = true; await inquireBankDonation(f.db, id, actor, f.call, f.ready); assert.equal(bankBalance(f.row).returnedMinor, 300);
});
test("PayFor rejects another original order, wrong amounts and malformed successful responses", async () => {
  const saved = { ...process.env }, originalFetch = global.fetch;
  Object.assign(process.env, { PAYFOR_API_URL: "https://bank.invalid/api", PAYFOR_API_FORMAT: "FORM", PAYFOR_MBR_ID: "1", PAYFOR_MERCHANT_ID: "2", PAYFOR_USER_CODE: "3", PAYFOR_USER_PASS: "test-not-real" });
  try {
    for (const data of [{ ProcReturnCode: "00", OrderId: "FOREIGN", OrgOrderId: "FOREIGN" }, { ProcReturnCode: "00", OrderId: "OUR-REFUND", OrgOrderId: "A".repeat(24), PurchAmount: "100", Currency: "978", TxnType: "Refund" }]) {
      global.fetch = async () => new Response(JSON.stringify(data)); assert.equal((await callBankOperation(donation("PAYFOR"), "REFUND", "OUR-REFUND", 100)).state, "UNKNOWN");
    }
  } finally { global.fetch = originalFetch; process.env = saved; }
});

test("an HTTP error or malformed JSON can never count as Albaraka approval", async () => {
  const { albarakaService, isAlbarakaApproved, isAlbarakaTransportFailure } = await import("../../lib/albaraka");
  const originalFetch = global.fetch;
  try {
    global.fetch = async () => new Response(JSON.stringify({ ServiceResponseData: { ResponseCode: "0000" } }), { status: 502 });
    const response = await albarakaService("Agreement", {}, { correlationId: "TEST", config: cfg });
    assert.equal(isAlbarakaApproved(response), false); assert.equal(isAlbarakaTransportFailure(response), true);
    global.fetch = async () => new Response("null");
    assert.equal(isAlbarakaApproved(await albarakaService("Agreement", {}, { correlationId: "TEST", config: cfg })), false);
  } finally { global.fetch = originalFetch; }
});

test("Ziraat public checkout, 3D Host and reporting URLs are never treated as a refund API", async () => {
  const saved = { ...process.env };
  const originalFetch = global.fetch;
  let calls = 0;
  Object.assign(process.env, {
    PAYFOR_API_FORMAT: "FORM",
    PAYFOR_MBR_ID: "1", PAYFOR_MERCHANT_ID: "2",
    PAYFOR_USER_CODE: "3", PAYFOR_USER_PASS: "test-not-real",
  });
  try {
    global.fetch = async () => { calls++; throw new Error("unexpected bank request"); };
    for (const url of [
      "https://vpos.ziraatkatilim.com.tr/MPI/Default.aspx",
      "https://vpos.ziraatkatilim.com.tr/MPI/3DHost.aspx",
      "https://vpos.ziraatkatilim.com.tr/login",
      "https://vpos.ziraatkatilim.com.tr/login/",
    ]) {
      process.env.PAYFOR_API_URL = url;
      assert.throws(() => payForOperationsConfig(), /BANK_NOT_CONFIGURED/);
      await assert.rejects(callBankOperation(donation("PAYFOR"), "INQUIRE", "TEST"), /BANK_NOT_CONFIGURED/);
    }
    assert.equal(calls, 0, "no bank API calls may be made to checkout/reporting pages");
  } finally {
    global.fetch = originalFetch;
    process.env = saved;
  }
});

test("PayFor uses raw PayforRequest XML only when XML_BODY is explicitly configured", async () => {
  const saved = { ...process.env }, originalFetch = global.fetch;
  Object.assign(process.env, {
    PAYFOR_API_URL: "https://bank.invalid/xmlgate",
    PAYFOR_API_FORMAT: "XML_BODY",
    PAYFOR_MBR_ID: "1",
    PAYFOR_MERCHANT_ID: "2",
    PAYFOR_USER_CODE: "3",
    PAYFOR_USER_PASS: "synthetic-only",
  });
  try {
    let requested = false;
    global.fetch = async (_url, init) => {
      requested = true;
      const headers = new Headers(init?.headers);
      assert.equal(headers.get("Content-Type"), "text/xml; charset=utf-8");
      const body = String(init?.body);
      assert.match(body, /^<PayforRequest>/);
      assert.match(body, /<TxnType>OrderInquiry<\/TxnType>/);
      assert.match(body, /<SecureType>Inquiry<\/SecureType>/);
      assert.match(body, /<OrderId>A{24}<\/OrderId>/);
      assert.ok(!body.includes("prmstr="));
      assert.ok(!body.includes("MerchantPass"));
      return new Response("<PayforResponse><ProcReturnCode>00</ProcReturnCode><OrderId>" + "A".repeat(24) + "</OrderId></PayforResponse>");
    };
    const response = await callBankOperation(donation("PAYFOR"), "INQUIRE", "LOCAL-QUERY");
    assert.equal(requested, true);
    assert.equal(response.code, "00");
  } finally {
    global.fetch = originalFetch;
    process.env = saved;
  }
});
