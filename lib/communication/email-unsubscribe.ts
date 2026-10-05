import "server-only";

import { createHmac, timingSafeEqual } from "crypto";
import { getServerBaseUrl } from "@/lib/server-base-url";

function normalized(email: string): string {
  return email.trim().toLowerCase();
}

function secret(): string | null {
  return process.env.EMAIL_UNSUBSCRIBE_SECRET?.trim()
    || process.env.NEXTAUTH_SECRET?.trim()
    || process.env.AUTH_SECRET?.trim()
    || null;
}

export function emailUnsubscribeToken(email: string): string | null {
  const key = secret();
  const address = normalized(email);
  if (!key || !address) return null;
  return createHmac("sha256", key).update(address).digest("base64url");
}

export function verifyEmailUnsubscribeToken(email: string, token: string | null | undefined): boolean {
  const expected = emailUnsubscribeToken(email);
  if (!expected || !token) return false;
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(String(token));
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function buildEmailUnsubscribeUrl(email: string, locale?: string | null): Promise<string | null> {
  const token = emailUnsubscribeToken(email);
  if (!token) return null;
  const base = await getServerBaseUrl();
  const url = new URL("/api/communication/unsubscribe", base);
  url.searchParams.set("email", normalized(email));
  url.searchParams.set("token", token);
  if (locale) url.searchParams.set("locale", locale);
  return url.toString();
}

const LABELS: Record<string, string> = {
  ar: "إلغاء الاشتراك من الرسائل التسويقية",
  tr: "Pazarlama e-postalarından aboneliği iptal et",
  en: "Unsubscribe from marketing emails",
  fr: "Se désabonner des e-mails marketing",
};

export function appendMarketingUnsubscribeFooter(html: string, url: string, locale?: string | null): string {
  const lang = String(locale ?? "ar").toLowerCase().split(/[-_]/)[0];
  const label = LABELS[lang] ?? LABELS.en;
  const safeUrl = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const footer = `<div style="margin:28px auto 0;padding:16px 8px;border-top:1px solid #e5e7eb;text-align:center;font:12px/1.6 Arial,sans-serif;color:#64748b"><a href="${safeUrl}" style="color:#64748b;text-decoration:underline">${label}</a></div>`;
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${footer}</body>`) : `${html}${footer}`;
}
