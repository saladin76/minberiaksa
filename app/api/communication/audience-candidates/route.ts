import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { requireAdminOrDashboardPermission } from "@/lib/dashboard/api-auth";
import { prisma } from "@/lib/prisma";
import { donorChannelEligibility } from "@/lib/communication/audience-service";
import { isCommunicationChannel } from "@/lib/communication/communication-runtime-types";
import { getUserIdsMatchingBadge, getBadgeIdsByUser } from "@/lib/badge-criteria";
import { resolveUserCountry } from "@/lib/dashboard/resolve-user-country";
import { getCountryDisplayNameFromCode } from "@/lib/dashboard/country-display-name";
import { isValidLocale, DEFAULT_LOCALE } from "@/lib/locales";
import {
  birthdateRangeForAges,
  genderQueryValues,
  parseAgeParam,
  parseGenderParam,
} from "@/lib/dashboard/user-demographics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Donors as campaign candidates, for the audience step of the wizard.
 *
 * Deliberately not `/api/users?scope=donors`. That endpoint knows nothing about channels, and for
 * this screen the channel is the whole point: a donor with no phone is a perfectly good donor and a
 * dead SMS recipient. Selecting them there would produce a campaign whose real reach is a fraction
 * of the number shown, discovered only after sending. So each row carries its eligibility for the
 * campaign's channel, and the counts distinguish "matched your filter" from "can actually receive
 * this".
 *
 * `NEEDS_REVIEW` is WhatsApp-specific and stays distinct from `UNAVAILABLE` rather than folded into
 * it: those donors have a phone but no recorded opt-in, which is a consent decision for a human,
 * not a filtering accident.
 *
 * Country, badges and language mirror the المتبرعون table so the same audience can be reasoned
 * about the same way in both places. Facets (the filter dropdowns' options) are returned from here
 * rather than fetched separately, so the whole screen needs one permission — `messages` — instead
 * of also requiring `badges` just to populate a filter.
 */

const PAGE_SIZE_MAX = 100;
const SELECT_ALL_CEILING = 5000;

const donorSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  image: true,
  preferredLang: true,
  country: true,
  countryCode: true,
  countryName: true,
} satisfies Prisma.UserSelect;

type DonorRow = Prisma.UserGetPayload<{ select: typeof donorSelect }>;

/** Extra fields eligibility needs but the table never renders. */
const eligibilitySelect = {
  id: true,
  email: true,
  phone: true,
  emailNotifications: true,
  smsNotifications: true,
} satisfies Prisma.UserSelect;

type FilterInput = {
  search?: string | null;
  locale?: string | null;
  country?: string | null;
  badgeId?: string | null;
  gender?: string | null;
  minAge?: string | number | null;
  maxAge?: string | number | null;
};

function ageInput(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return parseAgeParam(typeof value === "number" ? String(value) : value);
}

/**
 * Build the donor `where` for the current filters.
 *
 * Badge membership is computed, not stored — there is no User↔Badge row to join — so a badge filter
 * has to resolve to an id list first, exactly as the المتبرعون endpoint does. An empty result is
 * passed through as `id: { in: [] }` rather than dropped, otherwise "badge with no members" would
 * silently widen to "every donor".
 */
async function buildWhere(f: FilterInput): Promise<Prisma.UserWhereInput> {
  const where: Prisma.UserWhereInput = { role: "DONOR" };

  if (f.locale && f.locale !== "all" && isValidLocale(f.locale)) where.preferredLang = f.locale;
  if (f.country && f.country !== "all") where.countryCode = f.country;

  const search = f.search?.trim();
  if (search) {
    where.OR = [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search } },
    ];
  }

  // Gender is stored free-form (signup, complete-profile and the donation dialog
  // each write it), so match every spelling rather than one canonical value.
  const gender = parseGenderParam(f.gender);
  if (gender) where.gender = { in: genderQueryValues(gender) };

  // `birthdate` is an ISO "YYYY-MM-DD" string and ISO dates sort
  // lexicographically, so an age range is a plain string range — no computed
  // field needed. Donors with no birthdate fall out, which is what "aged 25-40"
  // should mean for a targeted send.
  const birthdateRange = birthdateRangeForAges(ageInput(f.minAge), ageInput(f.maxAge));
  if (birthdateRange) where.birthdate = birthdateRange;

  if (f.badgeId && f.badgeId !== "all") {
    const badge = await prisma.badge.findUnique({ where: { id: f.badgeId }, select: { criteria: true } });
    where.id = { in: badge ? await getUserIdsMatchingBadge(badge.criteria) : [] };
  }

  return where;
}

type ConsentProfile = { doNotContact: boolean; emailOptIn: boolean; smsOptIn: boolean; whatsappOptIn: boolean };

async function eligibilityProfiles(userIds: string[]): Promise<Map<string, ConsentProfile>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.donorCommunicationProfile
    .findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, whatsappOptIn: true, emailOptIn: true, smsOptIn: true, doNotContact: true },
    })
    .catch(() => []);
  return new Map(rows.map((r) => [r.userId, r]));
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  const sp = request.nextUrl.searchParams;
  const channel = sp.get("channel");
  if (!isCommunicationChannel(channel)) {
    return NextResponse.json({ ok: false, error: "channel must be EMAIL, WHATSAPP or SMS" }, { status: 400 });
  }

  const eligibilityFilter = sp.get("eligibility") || "all";
  const page = Math.max(1, parseInt(sp.get("page") || "1"));
  const limit = Math.min(PAGE_SIZE_MAX, Math.max(1, parseInt(sp.get("limit") || "25")));

  const where = await buildWhere({
    search: sp.get("search"),
    locale: sp.get("locale"),
    country: sp.get("country"),
    badgeId: sp.get("badgeId"),
    gender: sp.get("gender"),
    minAge: sp.get("minAge"),
    maxAge: sp.get("maxAge"),
  });

  const [total, rows, allBadges] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      select: { ...donorSelect, ...eligibilitySelect },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.badge.findMany({
      select: { id: true, name: true, color: true, criteria: true, translations: { select: { locale: true, name: true } } },
      orderBy: { order: "asc" },
    }),
  ]);

  const pageIds = rows.map((r) => r.id);
  const [profiles, badgeIdsByUser] = await Promise.all([
    eligibilityProfiles(pageIds),
    pageIds.length ? getBadgeIdsByUser(pageIds, allBadges) : Promise.resolve(new Map<string, string[]>()),
  ]);

  let donors = rows.map((u) => {
    const resolved = resolveUserCountry(u as DonorRow);
    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      image: u.image,
      locale: u.preferredLang && isValidLocale(u.preferredLang) ? u.preferredLang : DEFAULT_LOCALE,
      countryCode: resolved.code,
      countryName: resolved.name,
      badgeIds: badgeIdsByUser.get(u.id) ?? [],
      eligibility: donorChannelEligibility(
        { email: u.email, phone: u.phone, emailNotifications: u.emailNotifications, smsNotifications: u.smsNotifications },
        channel,
        profiles.get(u.id) ?? null,
      ),
    };
  });

  if (eligibilityFilter === "eligible") donors = donors.filter((d) => d.eligibility === "ELIGIBLE");
  else if (eligibilityFilter === "ineligible") donors = donors.filter((d) => d.eligibility !== "ELIGIBLE");

  // Facets are computed over ALL donors, not the current filter, so narrowing by one dimension
  // never empties the other dropdowns and strands the operator with no way back.
  const countryGroups = await prisma.user.groupBy({
    by: ["countryCode"],
    where: { role: "DONOR", countryCode: { not: null } },
    _count: { id: true },
  });
  const countries = countryGroups
    .filter((c): c is typeof c & { countryCode: string } => Boolean(c.countryCode))
    .map((c) => ({ code: c.countryCode, name: getCountryDisplayNameFromCode(c.countryCode, "ar"), count: c._count.id }))
    // Busiest first: with 70+ countries an alphabetical list buries the handful anyone uses.
    .sort((a, b) => b.count - a.count);

  return NextResponse.json({
    ok: true,
    donors,
    pagination: { total, page, limit },
    facets: {
      countries,
      badges: allBadges.map((b) => ({
        id: b.id,
        name: b.translations.find((t) => t.locale === "ar")?.name || b.name,
        color: b.color,
      })),
    },
  });
}

/**
 * Resolve the full id list for the current filter, so «تحديد كل النتائج» selects what the operator
 * sees rather than only the loaded page.
 *
 * A separate POST rather than an ever-growing page size: the answer can be thousands of ids and is
 * only ever needed at the moment of the click, not on every keystroke of the search box.
 */
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const denied = requireAdminOrDashboardPermission(session, "messages");
  if (denied) return denied;

  let body: FilterInput & { channel?: string; eligibility?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const channel = body.channel;
  if (!isCommunicationChannel(channel)) {
    return NextResponse.json({ ok: false, error: "channel must be EMAIL, WHATSAPP or SMS" }, { status: 400 });
  }

  const where = await buildWhere(body);
  const rows = await prisma.user.findMany({ where, select: eligibilitySelect, take: SELECT_ALL_CEILING });
  const profiles = await eligibilityProfiles(rows.map((r) => r.id));

  const ids = rows
    .filter((u) => {
      if (!body.eligibility || body.eligibility === "all") return true;
      const e = donorChannelEligibility(
        { email: u.email, phone: u.phone, emailNotifications: u.emailNotifications, smsNotifications: u.smsNotifications },
        channel,
        profiles.get(u.id) ?? null,
      );
      return body.eligibility === "ineligible" ? e !== "ELIGIBLE" : e === "ELIGIBLE";
    })
    .map((u) => u.id);

  return NextResponse.json({ ok: true, ids, truncated: rows.length >= SELECT_ALL_CEILING });
}
