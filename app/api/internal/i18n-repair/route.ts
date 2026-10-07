import { NextRequest, NextResponse } from "next/server";
import { translateLocale } from "@/lib/content-localization/translate";
import { isValidLocale } from "@/lib/locales";

import en from "@/i18n/messages/en.json";
import ar from "@/i18n/messages/ar.json";
import tr from "@/i18n/messages/tr.json";
import fr from "@/i18n/messages/fr.json";
import de from "@/i18n/messages/de.json";
import es from "@/i18n/messages/es.json";
import id from "@/i18n/messages/id.json";
import pt from "@/i18n/messages/pt.json";
import ur from "@/i18n/messages/ur.json";
import sq from "@/i18n/messages/sq.json";
import it from "@/i18n/messages/it.json";
import nl from "@/i18n/messages/nl.json";
import sv from "@/i18n/messages/sv.json";
import no from "@/i18n/messages/no.json";
import da from "@/i18n/messages/da.json";
import ms from "@/i18n/messages/ms.json";
import ja from "@/i18n/messages/ja.json";
import zh from "@/i18n/messages/zh.json";
import hi from "@/i18n/messages/hi.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type JsonObject = Record<string, unknown>;

const catalogs: Record<string, JsonObject> = {
  ar, tr, en, fr, de, es, id, pt, ur, sq, it, nl, sv, no, da, ms, ja, zh, hi,
};

function flatten(value: unknown, prefix = "", out: Record<string, string> = {}) {
  if (typeof value === "string") {
    out[prefix] = value;
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => flatten(child, `${prefix}[${index}]`, out));
    return out;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as JsonObject)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
}

function optionalLocked(locale: string, key: string) {
  return locale === "ar" && /^quran\.[^.]+\.t$/.test(key);
}

/**
 * Preview-only maintenance helper.
 *
 * It cannot write to the database or repository. It only returns translations
 * for catalog keys that are absent in the requested locale, which are then
 * reviewed and committed through the normal repository workflow. Production
 * returns 404 so this never becomes a public translation proxy.
 */
export async function GET(request: NextRequest) {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== "fix/production-runtime-audit-oct7-safe"
  ) {
    return new NextResponse(null, { status: 404 });
  }

  const locale = request.nextUrl.searchParams.get("locale") ?? "";
  if (!isValidLocale(locale) || locale === "en") {
    return NextResponse.json({ error: "Invalid target locale" }, { status: 400 });
  }

  const offset = Math.max(0, Number(request.nextUrl.searchParams.get("offset") ?? 0) || 0);
  const limit = Math.max(1, Math.min(60, Number(request.nextUrl.searchParams.get("limit") ?? 40) || 40));

  const reference = flatten(en);
  const target = flatten(catalogs[locale]);
  const missing = Object.keys(reference)
    .filter((key) => !(key in target) && !optionalLocked(locale, key))
    .sort();

  const keys = missing.slice(offset, offset + limit);
  const fields = Object.fromEntries(keys.map((key) => [key, reference[key]]));
  if (!keys.length) {
    return NextResponse.json({ ok: true, locale, totalMissing: missing.length, offset, keys: [], translations: {}, warnings: [] });
  }

  const translated = await translateLocale(
    { fields, sourceLocale: "en", itemLabel: "website interface message catalog", policy: "STANDARD" },
    locale,
  );

  return NextResponse.json({
    ok: true,
    locale,
    totalMissing: missing.length,
    offset,
    keys,
    translations: translated.fields,
    warnings: translated.warnings,
  });
}
