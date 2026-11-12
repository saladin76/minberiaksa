import {
  albarakaConfig, albaraka2DConfig, albarakaRecurringConfig, albarakaInquiryMac, albarakaReverseMac,
  albarakaService, isAlbarakaApproved, isAlbarakaConfigured, isAlbarakaTransportFailure,
  ALBARAKA_INQUIRY_MAC_PARAMS, ALBARAKA_REVERSE_MAC_PARAMS, type AlbarakaConfig,
} from "../albaraka";
import { bankSale, object, type BankAction, type BankDonation } from "./bank-operations-core";
import { inquiryMinor } from "./bank-operations-inspection";
import { SaxesParser } from "saxes";

export type BankReply = { state: "SUCCEEDED" | "DECLINED" | "UNKNOWN"; code: string; reference?: string; data?: Record<string, unknown> };
export function operationAlbarakaConfig(donation: BankDonation): AlbarakaConfig {
  const sale = bankSale(donation), cfg = sale.recurring ? albarakaRecurringConfig() : sale.secure ? albarakaConfig() : albaraka2DConfig();
  if (!isAlbarakaConfigured(cfg)) throw new Error("BANK_NOT_CONFIGURED");
  if ((sale.terminalNo && sale.terminalNo !== cfg.terminalNo) || (sale.merchantNo && sale.merchantNo !== cfg.merchantNo)) throw new Error("TERMINAL_MISMATCH");
  return cfg;
}
/**
 * These public Ziraat Katılım URLs are checkout/reporting pages, NOT a
 * confirmed merchant financial-operations API. Never POST refund credentials
 * to them even if they are accidentally configured as PAYFOR_API_URL.
 */
const PAYFOR_NON_OPERATION_PATHS = new Set([
  "/mpi/default.aspx",
  "/mpi/3dhost.aspx",
  "/login",
]);
export function payForOperationsConfig() {
  const url = process.env.PAYFOR_API_URL || "", format = process.env.PAYFOR_API_FORMAT;
  let parsed: URL | null = null;
  try { parsed = url ? new URL(url) : null; } catch { throw new Error("BANK_NOT_CONFIGURED"); }
  if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || !["FORM", "XML_PRMSTR", "XML_BODY"].includes(format || "") || !process.env.PAYFOR_MBR_ID || !process.env.PAYFOR_MERCHANT_ID || !process.env.PAYFOR_USER_CODE || !process.env.PAYFOR_USER_PASS) throw new Error("BANK_NOT_CONFIGURED");
  if (parsed.hostname.toLowerCase() === "vpos.ziraatkatilim.com.tr"
    && PAYFOR_NON_OPERATION_PATHS.has(parsed.pathname.toLowerCase().replace(/\/+$/, ""))) {
    throw new Error("BANK_NOT_CONFIGURED");
  }
  return { url, format };
}
export function bankOperationsReady(donation: BankDonation): { ready: boolean; reason?: string } {
  try { const sale = bankSale(donation); if (sale.provider === "ALBARAKA") operationAlbarakaConfig(donation); else { payForOperationsConfig(); payForBankFields(donation, "INQUIRE", "CONFIGCHECK"); } return { ready: true }; }
  catch (error) { return { ready: false, reason: error instanceof Error ? error.message : "BANK_NOT_CONFIGURED" }; }
}
export function albarakaBankBody(donation: BankDonation, cfg: AlbarakaConfig, action: BankAction | "INQUIRE", amountMinor?: number) {
  const sale = bankSale(donation), inquiry = action === "INQUIRE";
  const orderId = !inquiry && sale.reference ? null : sale.bankOrderId;
  const referenceCode = inquiry ? null : sale.reference;
  return { ApiType: "JSON", ApiVersion: "V100", MerchantNo: cfg.merchantNo, TerminalNo: cfg.terminalNo, IsEncrypted: "N",
    MAC: inquiry ? albarakaInquiryMac(cfg, cfg.encKey) : albarakaReverseMac({ merchantNo: cfg.merchantNo, terminalNo: cfg.terminalNo, referenceCode, orderId }, cfg.encKey),
    MACParams: inquiry ? ALBARAKA_INQUIRY_MAC_PARAMS : ALBARAKA_REVERSE_MAC_PARAMS, OrderId: orderId,
    ...(!inquiry ? { ReferenceCode: referenceCode, TransactionType: "Sale" } : {}),
    ...(action === "REFUND" ? { Amount: String(amountMinor), CurrencyCode: sale.currencyCode } : {}),
  };
}
/**
 * PayFor integration guide v1.9, sections 6.6/6.7/6.9:
 * - OrderInquiry identifies the ORIGINAL sale with OrderId.
 * - Void and Refund identify the ORIGINAL sale with OrgOrderId.
 * - Adjustment OrderId is deliberately omitted: it is not part of the
 *   bank's documented minimum request and must not be invented.
 *
 * operationId remains the local idempotency/audit reference; the adapter does
 * not transmit it unless the bank explicitly documents an additional field.
 */
export function payForBankFields(donation: BankDonation, action: BankAction | "INQUIRE", _operationId: string, amountMinor?: number): Record<string, string> {
  const sale = bankSale(donation);
  if (sale.merchantNo && sale.merchantNo !== process.env.PAYFOR_MERCHANT_ID || sale.mbrId && sale.mbrId !== process.env.PAYFOR_MBR_ID) throw new Error("TERMINAL_MISMATCH");
  if (action === "REFUND" && (!Number.isSafeInteger(amountMinor) || (amountMinor ?? 0) <= 0 || (amountMinor ?? 0) > sale.amountMinor)) throw new Error("INVALID_AMOUNT");
  return {
    MbrId: process.env.PAYFOR_MBR_ID!,
    MerchantID: process.env.PAYFOR_MERCHANT_ID!,
    UserCode: process.env.PAYFOR_USER_CODE!,
    UserPass: process.env.PAYFOR_USER_PASS!,
    ...(action === "INQUIRE" ? { OrderId: sale.orderId } : { OrgOrderId: sale.orderId }),
    SecureType: action === "INQUIRE" ? "Inquiry" : "NonSecure",
    TxnType: action === "INQUIRE" ? "OrderInquiry" : action === "VOID" ? "Void" : "Refund",
    Currency: sale.currencyCode,
    Lang: "TR",
    ...(action === "REFUND" ? { PurchAmount: (amountMinor! / 100).toFixed(2) } : {}),
  };
}

/** According to PayFor error-code guide, these are inconclusive bank outcomes. */
export const PAYFOR_UNRESOLVED_CODES = new Set([
  "V000", // Processing ongoing, no final authorization result.
  "V020", // Original transaction not yet complete.
  "V036", // VPOS system error.
  "V9196", "V9199", // VPOS/bank connection errors.
  "91", "96", // Issuer inoperative / system malfunction.
  "M61", // Session timeout, final outcome unverified.
]);

/**
 * Reconcile the bank's outcome with the ORIGINAL transaction identity.
 * An operation-specific OrderId alone is not evidence of the original sale.
 */
export function payForResponseBelongsToSale(safe: Record<string, string>, saleOrderId: string, action: BankAction | "INQUIRE"): boolean {
  if (action === "INQUIRE") return safe.OrderId === saleOrderId && (!safe.OrgOrderId || safe.OrgOrderId === saleOrderId);
  if (safe.OrgOrderId) return safe.OrgOrderId === saleOrderId;
  return safe.OrderId === saleOrderId;
}


const SAFE_FIELDS = ["OrderId", "OrgOrderId", "TxnType", "OrgTxnType", "TxnStatus", "TxnResult", "ProcReturnCode", "AuthCode", "HostRefNum", "RefundedAmount", "PurchAmount", "Currency", "ResponseCode", "ReferenceCode", "VoidDate"];
export function parsePayForBankReply(text: string): Record<string, string> {
  if (text.length > 524288 || /<!DOCTYPE|<!ENTITY/i.test(text)) return {};
  let source: Record<string, unknown> = {};
  if (text.trim().startsWith("{")) { try { source = object(JSON.parse(text)); } catch { return {}; } }
  else if (text.trim().startsWith("<")) {
    try {
      const parser = new SaxesParser({ xmlns: false });
      const stack: Array<{ name: string; text: string; nested: boolean }> = [];
      parser.on("doctype", () => { throw new Error("DTD"); });
      parser.on("opentag", tag => { if (stack.length > 12) throw new Error("DEPTH"); if (stack.length) stack[stack.length - 1].nested = true; stack.push({ name: tag.name, text: "", nested: false }); });
      const append = (value: string) => { if (stack.length) stack[stack.length - 1].text += value; };
      parser.on("text", append); parser.on("cdata", append);
      parser.on("closetag", () => { const node = stack.pop()!; if (!SAFE_FIELDS.includes(node.name)) return; if (node.nested || node.name in source) throw new Error("AMBIGUOUS_FIELD"); source[node.name] = node.text; });
      parser.write(text).close();
    } catch { return {}; }
  } else { const values = new URLSearchParams(text.trim()); for (const key of SAFE_FIELDS) if (values.getAll(key).length > 1) return {}; source = Object.fromEntries(values); }
  return Object.fromEntries(SAFE_FIELDS.filter(key => source[key] != null && ["string", "number"].includes(typeof source[key])).map(key => [key, String(source[key]).slice(0, 150)]));
}
function xml(value: string): string { return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;"); }
/** Uses only the bank-confirmed API endpoint/encoding. Never guesses from the 3D URL. */
export async function callBankOperation(donation: BankDonation, action: BankAction | "INQUIRE", operationId: string, amountMinor?: number): Promise<BankReply> {
  const sale = bankSale(donation);
  if (sale.provider === "ALBARAKA") {
    const cfg = operationAlbarakaConfig(donation);
    const response = await albarakaService(action === "INQUIRE" ? "Agreement" : action === "VOID" ? "Reverse" : "Return", albarakaBankBody(donation, cfg, action, amountMinor), { correlationId: operationId, config: cfg, timeoutMs: 25000 });
    const code = String(response.ServiceResponseData?.ResponseCode || "");
    // Only whitelisted transaction fields leave this boundary; no PAN, CVC, keys or raw body.
    const rows = Array.isArray(response.TransactionData) ? response.TransactionData.map(row => object(row)).map(row => Object.fromEntries(["OrderId", "Amount", "CurrencyCode", "AuthCode", "TransactionDate", "TransactionType", "ReferenceCode"].filter(key => ["string", "number"].includes(typeof row[key])).map(key => [key, String(row[key]).slice(0, 150)]))) : [];
    const mismatch = action === "INQUIRE" && rows.some(row => row.OrderId && ![sale.orderId, sale.bankOrderId].includes(row.OrderId));
    return { state: mismatch || !code || isAlbarakaTransportFailure(response) ? "UNKNOWN" : isAlbarakaApproved(response) ? "SUCCEEDED" : "DECLINED", code: mismatch ? "IDENTITY_MISMATCH" : code, ...(response.ReferenceCode ? { reference: String(response.ReferenceCode) } : {}), ...(action === "INQUIRE" ? { data: { transactions: rows } } : {}) };
  }
  const cfg = payForOperationsConfig(), fields = payForBankFields(donation, action, operationId, amountMinor);
  const document = `<PayforRequest>${Object.entries(fields).map(([key, value]) => `<${key}>${xml(value)}</${key}>`).join("")}</PayforRequest>`;
  // Merchant samples may send PayforRequest as raw XML rather than in prmstr.
  // Explicit configuration only: never infer a request encoding from HTTP 200/302.
  const body = cfg.format === "FORM"
    ? new URLSearchParams(fields)
    : cfg.format === "XML_PRMSTR" ? new URLSearchParams({ prmstr: document }) : document;
  const contentType = cfg.format === "XML_BODY" ? "text/xml; charset=utf-8" : "application/x-www-form-urlencoded; charset=utf-8";
  const response = await fetch(cfg.url, { method: "POST", headers: { "Content-Type": contentType }, body, redirect: "error", signal: AbortSignal.timeout(25000), cache: "no-store" });
  const safe = parsePayForBankReply(await response.text());
  const code = safe.ProcReturnCode || safe.ResponseCode || "";
  const matching = payForResponseBelongsToSale(safe, sale.orderId, action);
  const expectedType = action === "VOID" ? "Void" : "Refund";
  const integrity = action === "INQUIRE"
    ? (!safe.Currency || safe.Currency === sale.currencyCode)
    : (!safe.TxnType || safe.TxnType === expectedType)
      && (!safe.Currency || safe.Currency === sale.currencyCode)
      && (action !== "REFUND" || !safe.PurchAmount || inquiryMinor(safe.PurchAmount) === amountMinor);
  const unresolved = PAYFOR_UNRESOLVED_CODES.has(code.toUpperCase())
    || (safe.TxnResult != null && !["Success", "Failed"].includes(safe.TxnResult));
  const state: BankReply["state"] = !response.ok || !code || !matching || !integrity || unresolved
    ? "UNKNOWN"
    : code === "00" && (!safe.TxnResult || safe.TxnResult === "Success")
      ? "SUCCEEDED"
      : code === "00" || safe.TxnResult === "Success" ? "UNKNOWN" : "DECLINED";
  return { state, code: !matching || !integrity ? "IDENTITY_MISMATCH" : code, reference: safe.HostRefNum || safe.OrderId, data: safe };
}
