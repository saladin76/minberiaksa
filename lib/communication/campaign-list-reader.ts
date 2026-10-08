import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";

/** Campaign reads must never mistake a database failure for an empty audience. */
export async function readCampaignAudienceList(listId: string) {
  if (!process.env.DATABASE_URL) throw new Error("AUDIENCE_DATABASE_UNAVAILABLE");
  const list = await prisma.communicationAudienceList.findUnique({
    where: { id: listId }, select: { id: true, type: true, status: true },
  });
  if (!list) throw new Error("AUDIENCE_LIST_NOT_FOUND");
  if (list.status !== "ACTIVE") throw new Error("AUDIENCE_LIST_NOT_ACTIVE");
  if (list.type === "TEST") throw new Error("TEST_AUDIENCE_NOT_ALLOWED_FOR_CAMPAIGN");
  return list;
}

export type CampaignListMember = {
  memberId: string;
  userId: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  locale: SupportedLocale;
  country: string | null;
  missingDonor: boolean;
};

/** Only real donor-list members belong to a campaign; test contacts stay in test sends. */
export async function readCampaignListPage(
  listId: string,
  opts: { limit: number; cursorId?: string | null },
): Promise<{ members: CampaignListMember[]; nextCursor: string | null; exhausted: boolean }> {
  const list = await readCampaignAudienceList(listId);
  if (list.type === "SMART") throw new Error("SMART_AUDIENCE_REQUIRES_RULE_LOADER");
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(1000, Math.floor(opts.limit))) : 500;
  const rows = await prisma.communicationAudienceMember.findMany({
    where: { listId, status: "ACTIVE", contactType: "DONOR", ...(opts.cursorId ? { id: { gt: opts.cursorId } } : {}) },
    orderBy: { id: "asc" }, take: limit,
    select: { id: true, userId: true, locale: true },
  });
  if (rows.some((row) => !row.userId)) throw new Error("AUDIENCE_MEMBER_MISSING_DONOR_REFERENCE");
  const donorIds = [...new Set(rows.map((row) => row.userId!))];
  const donors = donorIds.length ? await prisma.user.findMany({
    where: { id: { in: donorIds }, role: "DONOR" },
    select: { id: true, name: true, email: true, phone: true, preferredLang: true, countryCode: true },
  }) : [];
  const byId = new Map(donors.map((donor) => [donor.id, donor]));
  const nextCursor = rows.length ? rows[rows.length - 1].id : opts.cursorId ?? null;
  if (rows.length && opts.cursorId && nextCursor! <= opts.cursorId) throw new Error("AUDIENCE_CURSOR_NOT_ADVANCING");
  return {
    members: rows.map((row) => {
      const donor = byId.get(row.userId!);
      const preferred = donor ? donor.preferredLang : row.locale;
      return {
        memberId: row.id, userId: row.userId!, name: donor?.name ?? null,
        email: donor?.email ?? null, phone: donor?.phone ?? null,
        locale: preferred && isValidLocale(preferred) ? preferred : DEFAULT_LOCALE,
        country: donor?.countryCode ?? null, missingDonor: !donor,
      };
    }),
    nextCursor,
    exhausted: rows.length < limit,
  };
}
