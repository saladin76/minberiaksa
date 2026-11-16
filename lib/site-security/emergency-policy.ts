import { isSecurityExemptPath } from "./policy";
/**
 * Emergency switch, two levels (owner, 2026-11-15):
 *  DONATIONS — the site stays fully browsable; only STARTING a payment is refused, with a short
 *              notice in the donor's language. Payments already started (bank callbacks, PayPal
 *              return, failure recording) still complete, so nothing at the bank is lost.
 *  SITE      — the whole public site closes (maintenance page); the dashboard, login, cron,
 *              webhooks, every bank callback and the success page stay open.
 */
export type EmergencyMode = "OFF" | "DONATIONS" | "SITE";
export const isEmergencyMode = (v: unknown): v is EmergencyMode => v === "OFF" || v === "DONATIONS" || v === "SITE";

/** The requests that START a payment (from lib/minbar/checkout.ts and the direct donation API). */
const PAYMENT_START = /^\/api\/(?:cart\/payment|donations|albaraka\/3d\/initiate|payfor\/3dpay\/initiate|paypal\/orders|stripe\/charge)\/?$/;
export function isPaymentStartRequest(method: string, path: string): boolean {
  return method.toUpperCase() === "POST" && PAYMENT_START.test(path);
}

export function isEmergencyAllowedPath(path: string): boolean {
  return (
    isSecurityExemptPath(path) ||
    /^\/api\/dashboard(?:\/|$)/.test(path) ||
    /^\/[a-z]{2}\/success\/[a-f\d]{24}(?:\/|$)/i.test(path)
  );
}

export { pauseTexts, requestLocale } from "./emergency-texts";

export const EMERGENCY_PAGE = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>صيانة مؤقتة · Minber-i Aksa</title><body style="font-family:system-ui,-apple-system,Segoe UI,Tahoma,sans-serif;max-width:40rem;margin:12vh auto;padding:2rem;line-height:1.7;color:#1f2937"><h1 style="color:#8b1d1d">الموقع متوقف مؤقتاً للصيانة</h1><p>نعمل على تحسين الموقع وسيعود قريباً بإذن الله. شكراً لصبركم ودعمكم.</p><hr style="margin:2rem 0;border:0;border-top:1px solid #e5e7eb"><p lang="tr" dir="ltr">Sitemiz kısa bir süreliğine bakımdadır. En kısa sürede geri döneceğiz. Desteğiniz için teşekkür ederiz.</p><p lang="en" dir="ltr">Our website is temporarily down for maintenance and will be back shortly. Thank you for your patience and support.</p><p lang="fr" dir="ltr">Notre site est temporairement en maintenance et sera de retour sous peu. Merci de votre patience et de votre soutien.</p></body></html>`;
