import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { LOCALES } from "@/lib/seo";
import { pickLocaleSlug, whereByIdOrAnyLocaleSlug } from "@/lib/slug";

const DYNAMIC_ROUTE_KINDS = new Set(["campaign", "category", "blog"]);

function isSupportedLocale(value: string): value is (typeof LOCALES)[number] {
  return (LOCALES as readonly string[]).includes(value);
}

function cleanPath(pathname: string): string[] {
  return pathname.split("?")[0].split("#")[0].split("/").filter(Boolean);
}

function fallbackPath(targetLocale: string, segments: string[]): string {
  const withoutLocale = isSupportedLocale(segments[0] ?? "") ? segments.slice(1) : segments;
  return withoutLocale.length ? `/${targetLocale}/${withoutLocale.join("/")}` : `/${targetLocale}`;
}

async function resolveEntity(kind: string, idOrSlug: string, targetLocale: string): Promise<string | null> {
  if (kind === "campaign") {
    const row = await prisma.campaign.findFirst({
      where: whereByIdOrAnyLocaleSlug(idOrSlug),
      select: { id: true, slug: true, translations: { select: { locale: true, slug: true } } },
    });
    if (!row) return null;
    return pickLocaleSlug(row.slug, row.translations, targetLocale) ?? row.id;
  }

  if (kind === "category") {
    const row = await prisma.category.findFirst({
      where: whereByIdOrAnyLocaleSlug(idOrSlug),
      select: { id: true, slug: true, translations: { select: { locale: true, slug: true } } },
    });
    if (!row) return null;
    return pickLocaleSlug(row.slug, row.translations, targetLocale) ?? row.id;
  }

  if (kind === "blog") {
    const row = await prisma.post.findFirst({
      where: whereByIdOrAnyLocaleSlug(idOrSlug),
      select: { id: true, slug: true, translations: { select: { locale: true, slug: true } } },
    });
    if (!row) return null;
    return pickLocaleSlug(row.slug, row.translations, targetLocale) ?? row.id;
  }

  return null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const targetLocale = url.searchParams.get("targetLocale") ?? "";
  const pathname = url.searchParams.get("pathname") ?? "/";

  if (!isSupportedLocale(targetLocale)) {
    return NextResponse.json({ ok: false, path: "/ar", error: "unsupported_locale" }, { status: 400 });
  }

  const segments = cleanPath(pathname);
  const hasLocale = isSupportedLocale(segments[0] ?? "");
  const bodySegments = hasLocale ? segments.slice(1) : segments;
  const fallback = fallbackPath(targetLocale, segments);

  const kind = bodySegments[0];
  const idOrSlug = bodySegments[1];

  if (!kind || !idOrSlug || !DYNAMIC_ROUTE_KINDS.has(kind)) {
    return NextResponse.json({ ok: true, path: fallback, resolved: false });
  }

  try {
    const localizedSlug = await resolveEntity(kind, decodeURIComponent(idOrSlug), targetLocale);
    if (!localizedSlug) return NextResponse.json({ ok: true, path: fallback, resolved: false });

    const rest = bodySegments.slice(2).map(encodeURIComponent).join("/");
    const path = `/${targetLocale}/${kind}/${encodeURIComponent(localizedSlug)}${rest ? `/${rest}` : ""}`;
    return NextResponse.json({ ok: true, path, resolved: true, kind });
  } catch (error) {
    console.error("[resolve-localized-path] failed", error);
    return NextResponse.json({ ok: true, path: fallback, resolved: false });
  }
}
