/**
 * Per-platform expectations for tracking diagnostics — the source of truth for
 * which click-ids each ad platform reconciles against, which cookies are
 * required for high-quality matching, and which dynamic macros tend to be
 * unresolved (a common cause of "{{publisher_platform}}" landing in our DB).
 *
 * Centralized here so the same rules apply in the dashboard, audits, and
 * (later) the platform-API reconciliation module.
 */
import type { AdPlatform } from "@/lib/attribution/detect-source";

export interface PlatformExpectations {
  /** Click-id field names — ANY of these qualifies as a valid click-id. */
  clickIds: string[];
  /** Cookies / browser identifiers that improve match quality. */
  cookies: string[];
  /** Stable name of the conversion event we send server-side. */
  serverEvent: string | null;
  /** Stable name of the conversion event we send via the browser pixel. */
  browserEvent: string | null;
  /** Friendly Arabic label. */
  labelAr: string;
}

export const PLATFORM_EXPECTATIONS: Record<AdPlatform, PlatformExpectations> = {
  meta: {
    clickIds: ["fbclid", "fbc"],
    cookies: ["fbp", "fbc"],
    serverEvent: "Donate (CAPI)",
    browserEvent: "Donate (Pixel)",
    labelAr: "Meta",
  },
  google: {
    clickIds: ["gclid", "gbraid", "wbraid"],
    cookies: [],
    serverEvent: "Google Ads Conversion",
    browserEvent: "GA4 purchase",
    labelAr: "Google Ads",
  },
  tiktok: {
    clickIds: ["ttclid"],
    cookies: ["ttp"],
    serverEvent: "TikTok Events API",
    browserEvent: "TikTok Pixel CompletePayment",
    labelAr: "TikTok",
  },
  x: {
    clickIds: ["twclid"],
    cookies: [],
    serverEvent: "X CAPI Conversion",
    browserEvent: "X Pixel Conversion",
    labelAr: "X (Twitter)",
  },
  snapchat: {
    clickIds: ["scclid"],
    cookies: [],
    serverEvent: "Snap CAPI",
    browserEvent: "Snap Pixel",
    labelAr: "Snapchat",
  },
  linkedin: {
    clickIds: ["li_fat_id"],
    cookies: [],
    serverEvent: "LinkedIn CAPI",
    browserEvent: "LinkedIn Insight",
    labelAr: "LinkedIn",
  },
  reddit: {
    clickIds: ["rdt_cid"],
    cookies: [],
    serverEvent: null,
    browserEvent: "Reddit Pixel",
    labelAr: "Reddit",
  },
  "other-paid": {
    clickIds: [],
    cookies: [],
    serverEvent: null,
    browserEvent: null,
    labelAr: "إعلان مدفوع",
  },
  organic: {
    clickIds: [],
    cookies: [],
    serverEvent: null,
    browserEvent: null,
    labelAr: "غير إعلاني",
  },
};

/** True when value looks like an unresolved dynamic macro from an ad platform. */
export function isUnresolvedMacro(value: unknown): boolean {
  if (typeof value !== "string") return false;
  if (!value) return false;
  if (value.includes("{{") || value.includes("}}")) return true;
  if (/__\s*[A-Z]+(?:_[A-Z]+)*\s*__/.test(value)) return true;
  // Common literal placeholders seen in DCO / dynamic ads.
  const lc = value.toLowerCase();
  if (/^(null|none|undefined|n\/a)$/.test(lc)) return false; // not a macro, just empty
  return false;
}

export interface MacroDetection {
  field: string;
  value: string;
}

/** Detect unresolved macros across an attribution snapshot, returning the offending fields. */
export function detectUnresolvedMacros(
  attribution: Record<string, unknown> | null | undefined
): MacroDetection[] {
  if (!attribution) return [];
  const out: MacroDetection[] = [];
  for (const [field, raw] of Object.entries(attribution)) {
    if (typeof raw !== "string") continue;
    if (isUnresolvedMacro(raw)) {
      out.push({ field, value: raw });
    }
  }
  return out;
}

export function expectedClickIdsFor(platform: AdPlatform): string[] {
  return PLATFORM_EXPECTATIONS[platform]?.clickIds ?? [];
}

export function expectedClickIdsLabel(platform: AdPlatform): string {
  const ids = expectedClickIdsFor(platform);
  if (ids.length === 0) return "";
  return ids.join(" / ");
}
