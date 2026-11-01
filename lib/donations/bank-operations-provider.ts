import { SaxesParser } from "saxes";
import {
  albarakaConfig, albaraka2DConfig, albarakaRecurringConfig, albarakaInquiryMac, albarakaReverseMac,
  albarakaService, isAlbarakaApproved, isAlbarakaConfigured, isAlbarakaTransportFailure,
  ALBARAKA_INQUIRY_MAC_PARAMS, ALBARAKA_REVERSE_MAC_PARAMS, type AlbarakaConfig,
} from "../albaraka";
import { bankSale, object, type BankAction, type BankDonation } from "./bank-operations-core";

export type BankReply = { state: "SUCCEEDED" | "DECLINED" | "UNKNOWN"; code: string; reference?: string; data?: Record<string, unknown> };
export function operationAlbarakaConfig(donation: BankDonation): AlbarakaConfig {
  const sale = bankSale(donation), cfg = sale.recurring ? albarakaRecurringConfig() : sale.secure ? albarakaConfig() : albaraka2DConfig();
  if (!isAlbarakaConfigured(cfg)) throw new Error("BANK_NOT_CONFIGURED");
  if ((sale.terminalNo && sale.terminalNo !== cfg.terminalNo) || (sale.merchantNo && sale.merchantNo !== cfg.merchantNo)) throw new Error("TERMINAL_MISMATCH");
  return cfg;
}
export function payForOperationsConfig() {
  const url = process.env.PAYFOR_API_URL || "", format = process.env.PAYFOR_API_FORMAT;
  const parsed = url ? new URL(url) : null;
  if (!parsed || parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash || !["FORM", "XML_PRMSTR"].includes(format || "") || !process.env.PAYFOR_MBR_ID || !process.env.PAYFOR_MERCHANT_ID || !process.env.PAYFOR_USER_CODE || !process.env.PAYFOR_USER_PASS) throw new Error("BANK_NOT_CONFIGURED");
  return { url, format };
}
export function bankOperationsReady(donation: BankDonation): { ready: boolean; reason?: string } {
  try { const sale = bankSale(donation); if (sale.provider === "ALBARAKA") operationAlbarakaConfig(donation); else payForOperationsConfig(); return { ready: true }; }
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
export function payForBankFields(donation: BankDonation, action: BankAction | "INQUIRE", operationId: string, amountMinor?: number): Record<string, string> {
  const sale = bankSale(donation);
  return { MbrId: process.env.PAYFOR_MBR_ID!, MerchantID: process.env.PAYFOR_MERCHANT_ID!, UserCode: process.env.PAYFOR_USER_CODE!, UserPass: process.env.PAYFOR_USER_PASS!,
    ...(action === "INQUIRE" ? { OrderId: sale.orderId } : { OrgOrderId: sale.orderId, OrderId: operationId }),
    SecureType: action === "INQUIRE" ? "Inquiry" : "NonSecure", TxnType: action === "INQUIRE" ? "OrderInquiry" : action === "VOID" ? "Void" : "Refund",
    Currency: sale.currencyCode, Lang: "TR", ...(action === "REFUND" ? { PurchAmount: (amountMinor! / 100).toFixed(2) } : {}),
  };
}
const SAFE_FIELDS = ["OrderId", "OrgOrderId", "TxnType", "OrgTxnType", "TxnStatus", "TxnResult", "ProcReturnCode", "AuthCode", "HostRefNum", "RefundedAmount", "PurchAmount", "Currency", "ResponseCode", "ReferenceCode"];
export function parsePayForBankReply(text: string): Record<string, string> {
  if (text.length > 524288 || /<!DOCTYPE|<!ENTITY/i.test(text)) return {};
  let source: Record<string, unknown> = {};
  if (text.trim().startsWith("{")) { try { source = object(JSON.parse(text)); } catch { return {}; } }
  else if (text.trim().startsWith("<")) {
    const parser = new SaxesParser(), names: string[] = [];
    let current = "", invalid = false;
    parser.on("doctype", () => { invalid = true; });
    parser.on("error", () => { invalid = true; });
    parser.on("opentag", tag => { names.push(tag.name); current = ""; });
    const append = (value: string) => { if (SAFE_FIELDS.includes(names.at(-1) || "")) current += value; };
    parser.on("text", append); parser.on("cdata", append);
    parser.on("closetag", tag => {
      if (SAFE_FIELDS.includes(tag.name)) {
        if (source[tag.name] !== undefined) invalid = true;
        source[tag.name] = current;
      }
      names.pop(); current = "";
    });
    try { parser.write(text).close(); } catch { return {}; }
    if (invalid) return {};
  } else {
    const params = new URLSearchParams(text.trim().replaceAll(";;", "&"));
    if (SAFE_FIELDS.some(key => params.getAll(key).length > 1)) return {};
    source = Object.fromEntries(params);
  }
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
  const body = cfg.format === "FORM" ? new URLSearchParams(fields) : new URLSearchParams({ prmstr: `<PayforRequest>${Object.entries(fields).map(([key, value]) => `<${key}>${xml(value)}</${key}>`).join("")}</PayforRequest>` });
  const response = await fetch(cfg.url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8" }, body, redirect: "error", signal: AbortSignal.timeout(25000), cache: "no-store" });
  const safe = parsePayForBankReply(await response.text());
  const code = safe.ProcReturnCode || "";
  const matching = (safe.OrderId === (action === "INQUIRE" ? sale.orderId : operationId) || (action !== "INQUIRE" && safe.OrgOrderId === sale.orderId)) && (!safe.OrgOrderId || action === "INQUIRE" || safe.OrgOrderId === sale.orderId);
  return { state: !response.ok || !code || !matching ? "UNKNOWN" : code === "00" && (!safe.TxnResult || safe.TxnResult === "Success") ? "SUCCEEDED" : code === "00" ? "UNKNOWN" : "DECLINED", code: !matching ? "IDENTITY_MISMATCH" : code, reference: safe.HostRefNum || safe.OrderId, data: safe };
}
