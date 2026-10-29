import { readFileSync } from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import ts from "typescript";
import * as stateHelpers from "../../lib/donations/gift-delivery-state";
import * as giftTokens from "../../lib/donations/gift-certificate-token";
import * as projects from "../../lib/templates/donation-projects";
import { applyAppFont, automaticEmailHtml } from "../../lib/templates/font";

export function fixtureModule<T>(path: string, modules: Record<string, unknown>): T {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const loaded = { exports: {} };
  vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, URL, Date, Buffer, console: { error() {}, log() {} }, process: { env: { NODE_ENV: "production" } }, require: (key: string) => { assert.ok(key in modules, "Unexpected dependency: " + key); return modules[key]; } });
  return loaded.exports as T;
}

function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === "AND") return (condition as Record<string, unknown>[]).every(c => matches(row, c));
    if (key === "OR") return (condition as Record<string, unknown>[]).some(c => matches(row, c));
    if (condition && typeof condition === "object") return Object.entries(condition).every(([op, target]) => op === "isSet" ? (row[key] !== undefined) === target : op === "not" ? row[key] !== target && row[key] !== undefined : op === "lt" ? Boolean(row[key] && new Date(row[key] as string).getTime() < new Date(target as string).getTime()) : false);
    return row[key] === condition;
  });
}

export function giftFixture(options: { paid?: boolean; locale?: string; emailFails?: boolean; whatsappFails?: boolean; whatsappThrows?: boolean; emailGate?: Promise<void>; deniedRouting?: boolean; row?: Record<string, unknown>; campaign?: object } = {}) {
  const line: Record<string, unknown> = { id: "111111111111111111111111", donationId: "222222222222222222222222", campaign: options.campaign || { title: "Project", slug: "project" }, amount: 20,
    giftRecipientName: "Recipient", giftRecipientEmail: "recipient@example.test", giftRecipientPhone: "+905550000001", giftChannels: ["EMAIL", "WHATSAPP"], giftShowAmount: false, giftMessage: null, ...options.row };
  const emails: { html: string; to: string }[] = [], whatsapps: { body: string; phone: string }[] = [], pdfNames: string[] = [];
  const queries: unknown[] = [];
  const service = fixtureModule<{ deliverDonationGifts: (id: string) => Promise<{ lines: number; errors: number; emailsSent: number; whatsappSent: number }> }>("lib/donations/gift-delivery.ts", {
    "server-only": {}, "node:crypto": crypto, "@/lib/templates/donation-projects": projects,
    "@/lib/templates/font": { applyAppFont, automaticEmailHtml },
    "./gift-delivery-state": stateHelpers, "./gift-certificate-token": giftTokens,
    "@/lib/prisma": { prisma: {
      donation: { findUnique: async () => ({ paidAt: options.paid === false ? null : new Date(), accessToken: "fixture-access-secret", currency: "TRY", locale: options.locale || "en", donor: { name: "Donor" } }) },
      donationItem: {
        findMany: async (query: { where: Record<string, unknown>; include: unknown }) => { queries.push(query); return matches(line, query.where) ? [structuredClone(line)] : []; },
        findUnique: async () => structuredClone(line),
        updateMany: async (query: { where: Record<string, unknown>; data: object }) => { if (!matches(line, query.where)) return { count: 0 }; Object.assign(line, structuredClone(query.data)); return { count: 1 }; },
      },
    } },
    "@/i18n/locale-messages": { messagesFor: () => ({ Gift: { emailSubject: "Gift", emailTitle: "Gift", emailBody: "Project: {project}", emailAmount: "{amount}", whatsappBody: "Project: {project}", whatsappAmount: "{amount}" } }) },
    "@/lib/certificates/issue": { ensureDonationDocuments: async () => ({ locale: options.locale || "en", thanks: { donorName: "Donor" } }) },
    "@/lib/certificates/generate": { generateThanksPdf: async (docs: { thanks: { donorName: string } }) => { pdfNames.push(docs.thanks.donorName); return { filename: "gift.pdf", pdf: Buffer.from("fixture") }; } },
    "@/lib/payment-public-origin": { paymentPublicOrigin: () => "https://minberiaksa.org" },
    "@/lib/events/dispatch": { resolveTriggerSendConfig: async () => ({}), resolveTriggerSender: () => options.deniedRouting ? ({ ok: false, reason: "NO_SENDER_AVAILABLE" }) : ({ ok: true, sender: { id: "sender", senderEmail: "sender@example.test", phoneNumberId: "phone", businessAccountId: "waba" } }) },
    "@/lib/communication/delivery-log-service": { createDeliveryRecord: async () => ({ ok: true, data: { id: "archive" } }), markDeliveryStatus: async () => ({ ok: true }) },
    "@/lib/communication/providers/email/client": { sendEmailMessage: async (input: { html: string; to: string }) => { emails.push(input); if (options.emailGate) await options.emailGate; return options.emailFails ? { ok: false, reason: "EMAIL_REJECTED" } : { ok: true, providerMessageId: "email-accepted" }; } },
    "./gift-whatsapp": { sendGiftWhatsapp: async (input: { body: string; phone: string }) => { whatsapps.push(input); if (options.whatsappThrows) throw new Error("lost response"); return options.whatsappFails ? { ok: false, reason: "GIFT_TEMPLATE_APPROVAL_REQUIRED" } : { ok: true, providerMessageId: "wa-accepted" }; } },
    "@/lib/minbar/routes": { miaPath: () => "/en/bagislar/project" }, "@/lib/audit-log": { writeAuditLog: async () => {} },
  });
  return { line, emails, whatsapps, pdfNames, queries, deliver: () => service.deliverDonationGifts("222222222222222222222222") };
}
