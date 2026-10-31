import { createHash } from "node:crypto";
import { SUPPORTED_LOCALES } from "../locales";
import { donationReceiptText } from "../templates/donation-money";
import { RECEIPT_BRANDS } from "../templates/receipt-localization";
import { buildStandardMetaComponents, sameVariables, sameVariableSet, variableOrder, type ButtonDraft, type HeaderDraft } from "./meta-template-components";
import { templateLocaleFromLanguage } from "./template-locale-media";
import { resolveExactVariantForLocale, type VariantRow } from "./whatsapp-template-readiness";
import { hasWhatsappUnsubscribeQuickReply, whatsappUnsubscribeCopy } from "./whatsapp-template-unsubscribe";
import { localizeDonationFailureDraft } from "../templates/localize-donation-failure-link";

export type NotificationTemplateSource = {
  id: string; name: string; body: string; translations?: unknown; header?: unknown;
  footerText?: string | null; buttons?: unknown; category?: string | null; purpose?: string | null; kind?: string | null;
};
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, stable(child)]));
  return value ?? null;
}
export function notificationTemplateHash(source: NotificationTemplateSource): string {
  const { name, body, translations, header, footerText, buttons, category, purpose, kind } = source;
  return createHash("sha256").update(JSON.stringify(stable({ name, body, translations, header, footerText, buttons, category, purpose, kind }))).digest("hex");
}

/** Clone each real locale verbatim except the receipt slots and closing. No
 * translation generation, no deletion, and no silent Arabic fallback. */
export function notificationUpgradeDraft(source: NotificationTemplateSource, receipt: boolean, welcomeMarketing = false) {
  if (receipt && welcomeMarketing) throw new Error("WELCOME_MARKETING_CANNOT_BE_A_RECEIPT");
  const translations = record(source.translations);
  const rootHeader = record(source.header) as HeaderDraft;
  const rootButtons = (Array.isArray(source.buttons) ? source.buttons : []) as ButtonDraft[];
  const upgraded: Record<string, { body: string; header: HeaderDraft; headerText: string; footerText: string; buttons: ButtonDraft[] }> = {};
  for (const locale of SUPPORTED_LOCALES) {
    const own = record(translations[locale]);
    const body = locale === "ar" ? source.body : typeof own.body === "string" ? own.body : "";
    if (!body.trim()) throw new Error(`NOTIFICATION_TRANSLATION_MISSING:${locale}`);
    if (locale !== "ar" && rootButtons.length && (!Array.isArray(own.buttons) || own.buttons.length !== rootButtons.length)) throw new Error(`NOTIFICATION_BUTTON_TRANSLATION_MISSING:${locale}`);
    const header = locale === "ar" ? rootHeader : (own.header ? record(own.header) : rootHeader) as HeaderDraft;
    const headerText = locale === "ar" ? String(rootHeader.text ?? "") : typeof own.headerText === "string" ? own.headerText : String(header.text ?? "");
    if (locale !== "ar" && rootHeader.type === "TEXT" && !own.header && typeof own.headerText !== "string") throw new Error(`NOTIFICATION_HEADER_TRANSLATION_MISSING:${locale}`);
    let nextBody = receipt ? donationReceiptText(body) : body;
    if (receipt && /\{\{\s*donation\.(?:amount|totalAmount|amountUSD|notificationAmount)\s*\}\}/.test(nextBody)) throw new Error(`NOTIFICATION_AMOUNT_REVIEW_REQUIRED:${locale}`);
    nextBody = nextBody.replace(/\{\{\s*donation\.createdAt\s*\}\}/g, "{{donation.displayDate}}");
    const buttons = [...(locale === "ar" ? rootButtons : (own.buttons ?? []) as ButtonDraft[])];
    if (welcomeMarketing && !nextBody.includes(whatsappUnsubscribeCopy(locale).footer)) nextBody += `\n\n${whatsappUnsubscribeCopy(locale).footer}`;
    if (welcomeMarketing && !hasWhatsappUnsubscribeQuickReply(buttons)) {
      if (buttons.length >= 10) throw new Error(`WELCOME_UNSUBSCRIBE_BUTTON_LIMIT:${locale}`);
      buttons.push({ type: "QUICK_REPLY", text: whatsappUnsubscribeCopy(locale).button });
    }
    upgraded[locale] = { body: nextBody, header, headerText, footerText: RECEIPT_BRANDS[locale], buttons };
  }
  const canonical = buildStandardMetaComponents(upgraded.ar);
  for (const locale of SUPPORTED_LOCALES) {
    const built = buildStandardMetaComponents(upgraded[locale]);
    const same = canonical.parameterFormat === "positional" ? sameVariables : sameVariableSet;
    if (built.parameterFormat !== canonical.parameterFormat || !same(variableOrder(upgraded.ar.body), variableOrder(upgraded[locale].body)) || !same(variableOrder(upgraded.ar.headerText), variableOrder(upgraded[locale].headerText))) throw new Error(`NOTIFICATION_VARIABLES_MISMATCH:${locale}`);
  }
  // Content-addressed name makes reruns idempotent and avoids reusing an old
  // provider name after the administrator changes the source template.
  const sourceHash = notificationTemplateHash(source);
  const policyHash = createHash("sha256").update(`${welcomeMarketing ? "welcome-marketing-v3" : "concise-receipt-v2"}:${sourceHash}`).digest("hex");
  const name = `${source.name.replace(/_v\d+$/, "").slice(0, 90)}_notice_${policyHash.slice(0, 12)}`;
  return { name, body: upgraded.ar.body, header: upgraded.ar.header, footerText: upgraded.ar.footerText, buttons: upgraded.ar.buttons, translations: upgraded, sourceHash, ...(welcomeMarketing ? { category: "MARKETING" as const, purpose: "MARKETING" as const } : {}) };
}

/** Approval alone is insufficient: the provider must have the exact schema
 * submitted for this unchanged draft on the default WABA in every language. */
export function approvedNotificationLocales(draft: ReturnType<typeof notificationUpgradeDraft>, variants: VariantRow[]): string[] {
  return SUPPORTED_LOCALES.filter(locale => {
    const variant = resolveExactVariantForLocale(variants, locale);
    if (!variant.ready || variant.providerTemplateName !== draft.name || templateLocaleFromLanguage(variant.languageCode ?? "") !== locale || draft.category && variant.category !== draft.category) return false;
    // The publisher localizes failure links before submitting each language.
    // Compare with that same published projection, rather than an older
    // editorial URL preserved in this immutable draft. Text/buttons and the
    // exact provider family must still match; approval alone is insufficient.
    const expected = buildStandardMetaComponents(localizeDonationFailureDraft(draft.translations[locale], locale)).components;
    const shape = (value: unknown): unknown => Array.isArray(value) ? value.map(shape)
      : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "example").map(([key, child]) => [key, shape(child)])) : value;
    return JSON.stringify(stable(shape(variant.componentsSchema))) === JSON.stringify(stable(shape(expected)));
  });
}
