import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { donorChannelEligibility } from "@/lib/communication/audience-service";
import { recipientExclusionReason, RECIPIENT_REASON_LABELS } from "@/lib/communication/campaign-audience-accounting";
import { campaignCandidateWhere, candidatePagination } from "@/lib/communication/campaign-candidate-policy";
import { isCommunicationChannel } from "@/lib/communication/communication-runtime-types";
import { getUserIdsMatchingBadge, getBadgeIdsByUser } from "@/lib/badge-criteria";
import { resolveUserCountry } from "@/lib/dashboard/resolve-user-country";
import { getCountryDisplayNameFromCode } from "@/lib/dashboard/country-display-name";
import { isValidLocale, DEFAULT_LOCALE } from "@/lib/locales";
import { birthdateRangeForAges, genderQueryValues, parseAgeParam, parseGenderParam } from "@/lib/dashboard/user-demographics";
import { AUDIENCE_SELECTION_MAX } from "@/lib/communication/audience-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Candidate membership is separate from readiness. The default includes every
 * matching donor; explicit readiness filters use the same policy as campaign
 * execution. Neither GET nor select-all creates or updates a consent profile.
 */
const SELECT_ALL_CEILING = AUDIENCE_SELECTION_MAX;
const donorSelect = {
  id: true, name: true, email: true, phone: true, image: true, preferredLang: true,
  country: true, countryCode: true, countryName: true,
  communicationProfile: { select: { doNotContact: true, emailOptIn: true, smsOptIn: true, whatsappOptIn: true } },
} satisfies Prisma.UserSelect;
type DonorRow = Prisma.UserGetPayload<{ select: typeof donorSelect }>;
type FilterInput = {
  search?: string | null; locale?: string | null; country?: string | null;
  badgeId?: string | null; gender?: string | null;
  minAge?: string | number | null; maxAge?: string | number | null;
};

function reply(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
function ageInput(value: string | number | null | undefined): number | null {
  return value === null || value === undefined ? null : parseAgeParam(String(value));
}
function parseFilters(value: unknown): FilterInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const result: FilterInput = {};
  for (const key of ["search", "locale", "country", "badgeId", "gender"] as const) {
    const entry = raw[key];
    if (entry === null || entry === undefined || entry === "") continue;
    if (typeof entry !== "string" || entry.length > (key === "search" ? 200 : 100)) return null;
    result[key] = entry.trim();
  }
  if (result.locale && result.locale !== "all" && !isValidLocale(result.locale)) return null;
  if (result.country && result.country !== "all") {
    if (!/^[a-z]{2}$/i.test(result.country)) return null;
    result.country = result.country.toUpperCase();
  }
  if (result.badgeId && result.badgeId !== "all" && !/^[a-f0-9]{24}$/i.test(result.badgeId)) return null;
  if (result.gender && result.gender !== "all" && !parseGenderParam(result.gender)) return null;
  for (const key of ["minAge", "maxAge"] as const) {
    const entry = raw[key];
    if (entry === null || entry === undefined || entry === "") continue;
    if (typeof entry !== "number" && typeof entry !== "string") return null;
    const age = parseAgeParam(String(entry));
    if (age === null) return null;
    result[key] = age;
  }
  if (typeof result.minAge === "number" && typeof result.maxAge === "number" && result.minAge > result.maxAge) return null;
  return result;
}

async function buildWhere(f: FilterInput): Promise<Prisma.UserWhereInput> {
  const where: Prisma.UserWhereInput = { role: "DONOR" };
  if (f.locale && f.locale !== "all" && isValidLocale(f.locale)) where.preferredLang = f.locale;
  if (f.country && f.country !== "all") where.countryCode = f.country;
  const search = f.search?.trim();
  if (search) where.OR = [
    { name: { contains: search, mode: "insensitive" } },
    { email: { contains: search, mode: "insensitive" } },
    { phone: { contains: search } },
  ];
  const gender = parseGenderParam(f.gender);
  if (gender) where.gender = { in: genderQueryValues(gender) };
  const birthdateRange = birthdateRangeForAges(ageInput(f.minAge), ageInput(f.maxAge));
  if (birthdateRange) where.birthdate = birthdateRange;
  if (f.badgeId && f.badgeId !== "all") {
    const badge = await prisma.badge.findUnique({ where: { id: f.badgeId }, select: { criteria: true } });
    // An empty badge must stay empty, never widen to all donors.
    where.id = { in: badge ? await getUserIdsMatchingBadge(badge.criteria) : [] };
  }
  return where;
}

type ConsentProfile = { doNotContact: boolean; emailOptIn: boolean; smsOptIn: boolean; whatsappOptIn: boolean };
function eligibilityReason(
  donor: { email?: string | null; phone?: string | null },
  channel: "EMAIL" | "WHATSAPP" | "SMS",
  profile?: ConsentProfile | null,
): string | null {
  const reason = recipientExclusionReason(donor, channel, profile);
  return reason === null ? null : RECIPIENT_REASON_LABELS[reason];
}
function channelEligibilityWhere(
  base: Prisma.UserWhereInput,
  channel: "EMAIL" | "WHATSAPP" | "SMS",
  eligibility: string,
): Prisma.UserWhereInput {
  return campaignCandidateWhere(base, channel, eligibility);
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const channel = sp.get("channel");
  if (!isCommunicationChannel(channel)) return reply({ ok: false, error: "channel must be EMAIL, WHATSAPP or SMS" }, 400);
  const eligibilityFilter = sp.get("eligibility") || "all";
  if (!["all", "eligible", "ineligible"].includes(eligibilityFilter)) return reply({ ok: false, error: "Invalid eligibility filter" }, 400);
  const pagination = candidatePagination(sp.get("page"), sp.get("limit"));
  const filters = parseFilters({
    search: sp.get("search"), locale: sp.get("locale"), country: sp.get("country"),
    badgeId: sp.get("badgeId"), gender: sp.get("gender"), minAge: sp.get("minAge"), maxAge: sp.get("maxAge"),
  });
  if (!pagination || !filters) return reply({ ok: false, error: "Invalid audience filters or pagination" }, 400);
  const { page, limit } = pagination;
  try {
    const baseWhere = await buildWhere(filters);
    const where = channelEligibilityWhere(baseWhere, channel, eligibilityFilter);
    const [total, rows, allBadges] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({ where, select: donorSelect, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit }),
      prisma.badge.findMany({
        select: { id: true, name: true, color: true, criteria: true, translations: { select: { locale: true, name: true } } },
        orderBy: { order: "asc" },
      }),
    ]);
    const pageIds = rows.map((row) => row.id);
    const badgeIdsByUser = pageIds.length ? await getBadgeIdsByUser(pageIds, allBadges) : new Map<string, string[]>();
    const donors = rows.map((user) => {
      const resolved = resolveUserCountry(user as DonorRow);
      const profile = user.communicationProfile;
      return {
        id: user.id, name: user.name, email: user.email, phone: user.phone, image: user.image,
        locale: user.preferredLang && isValidLocale(user.preferredLang) ? user.preferredLang : DEFAULT_LOCALE,
        countryCode: resolved.code, countryName: resolved.name, badgeIds: badgeIdsByUser.get(user.id) ?? [],
        eligibility: donorChannelEligibility(user, channel, profile),
        eligibilityReason: eligibilityReason(user, channel, profile),
        canConfirmWhatsappOptIn: false,
      };
    });
    const countryGroups = await prisma.user.groupBy({
      by: ["countryCode"], where: { role: "DONOR", countryCode: { not: null } }, _count: { id: true },
    });
    const countries = countryGroups
      .filter((country): country is typeof country & { countryCode: string } => Boolean(country.countryCode))
      .map((country) => ({ code: country.countryCode, name: getCountryDisplayNameFromCode(country.countryCode, "ar"), count: country._count.id }))
      .sort((a, b) => b.count - a.count);
    return reply({
      ok: true, donors, pagination: { total, page, limit },
      facets: { countries, badges: allBadges.map((badge) => ({
        id: badge.id, name: badge.translations.find((translation) => translation.locale === "ar")?.name || badge.name, color: badge.color,
      })) },
    });
  } catch {
    // A failed read is not an empty audience, a consent decision or HTTP 200.
    return reply({ ok: false, error: "تعذّر تحميل جمهور الحملة. أعد المحاولة؛ الأعداد غير متاحة وليست صفرًا." }, 503);
  }
}

/** Select the same filtered population and order as GET, not just the visible page. */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;
  let body: unknown;
  try { body = await request.json(); } catch { return reply({ ok: false, error: "Invalid JSON" }, 400); }
  const filters = parseFilters(body);
  if (!filters || !body || typeof body !== "object") return reply({ ok: false, error: "Invalid audience filters" }, 400);
  const input = body as Record<string, unknown>;
  const channel = input.channel;
  if (!isCommunicationChannel(channel)) return reply({ ok: false, error: "channel must be EMAIL, WHATSAPP or SMS" }, 400);
  const eligibilityFilter = input.eligibility ?? "all";
  if (typeof eligibilityFilter !== "string" || !["all", "eligible", "ineligible"].includes(eligibilityFilter)) return reply({ ok: false, error: "Invalid eligibility filter" }, 400);
  try {
    const baseWhere = await buildWhere(filters);
    const where = channelEligibilityWhere(baseWhere, channel, eligibilityFilter);
    const rows = await prisma.user.findMany({
      where, select: { id: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: SELECT_ALL_CEILING + 1,
    });
    return reply({ ok: true, ids: rows.slice(0, SELECT_ALL_CEILING).map((row) => row.id), truncated: rows.length > SELECT_ALL_CEILING });
  } catch {
    return reply({ ok: false, error: "تعذّر تحديد جمهور الحملة. لم يتم اعتماد قائمة بديلة؛ أعد المحاولة." }, 503);
  }
}
