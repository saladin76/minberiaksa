import { prisma } from "@/lib/prisma";

/** ---------------- types ---------------- */

export interface TemplateUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  countryName: string;
  countryCode: string;
  city: string;
  region: string;
  preferredLang: string;
}

export interface TemplateDonationItem {
  campaignTitle: string;
  amount: string;
  amountUSD: string;
  currency: string;
  shareCount: string;
}

export interface TemplateDonation {
  id: string;
  amount: string;
  amountUSD: string;
  currency: string;
  totalAmount: string;
  status: string;
  createdAt: string;
  campaignTitle: string;
  itemCount: string;
  items: TemplateDonationItem[];
}

export interface TemplateTotals {
  count: string;
  amountUSD: string;
  lastAt: string;
}

/**
 * A campaign update (Update row) as a template sees it  set when an email
 * campaign was created from an update ("send this update to its donors"),
 * in the recipient's language. See lib/communication/update-campaign.ts.
 */
export interface TemplateUpdate {
  title: string;
  description: string;
  /** Photo URL, or "" (an Image block with an empty URL is dropped). */
  image: string;
  /** The video link (YouTube / Vimeo / uploaded file), or "". */
  videoUrl: string;
  /** A still of the video for email (videos cannot play inside email), or "". */
  videoThumbnail: string;
  /** The photo, else the video still: the one picture an email can always show. */
  cover: string;
  date: string;
  campaignTitle: string;
  /** The campaign page, opened on its updates, with UTM tags for attribution. */
  url: string;
  /** The campaign page's donate link. */
  donateUrl: string;
}

export interface TemplateContext {
  user: TemplateUser;
  donations: TemplateDonation[];
  totals: TemplateTotals;
  /** Set for trigger-driven flows where one specific donation is the focus */
  donation?: TemplateDonation;
  /** Set for a campaign-update email. */
  update?: TemplateUpdate;
}

/** ---------------- catalog (UI-facing) ---------------- */

export { VARIABLE_CATALOG } from "./variable-catalog";
export type { VariableEntry, VariableGroup } from "./variable-catalog";

/** ---------------- formatting helpers ---------------- */

const formatDate = (d: Date | null | undefined): string =>
  d ? new Date(d).toISOString().slice(0, 10) : "";

const formatNumber = (n: number | null | undefined, digits = 0): string =>
  typeof n === "number"
    ? n.toLocaleString(undefined, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    : "";

/** ---------------- loaders ---------------- */

const userSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  countryName: true,
  country: true,
  countryCode: true,
  city: true,
  region: true,
  preferredLang: true,
} as const;

const donationSelect = {
  id: true,
  amount: true,
  amountUSD: true,
  currency: true,
  totalAmount: true,
  status: true,
  createdAt: true,
  items: {
    select: {
      amount: true,
      amountUSD: true,
      shareCount: true,
      campaign: { select: { title: true } },
    },
  },
} as const;

type RawDonation = {
  id: string;
  amount: number;
  amountUSD: number | null;
  currency: string;
  totalAmount: number;
  status: string;
  createdAt: Date;
  items: {
    amount: number;
    amountUSD: number | null;
    shareCount: number | null;
    campaign: { title: string };
  }[];
};

function donationToContext(d: RawDonation): TemplateDonation {
  const items: TemplateDonationItem[] = d.items.map((it) => ({
    campaignTitle: it.campaign?.title ?? "",
    amount: formatNumber(it.amount, 0),
    amountUSD: formatNumber(it.amountUSD ?? 0, 0),
    currency: d.currency,
    shareCount: it.shareCount != null ? String(it.shareCount) : "",
  }));
  return {
    id: d.id,
    amount: formatNumber(d.amount, 0),
    amountUSD: formatNumber(d.amountUSD ?? 0, 0),
    currency: d.currency,
    totalAmount: formatNumber(d.totalAmount, 0),
    status: d.status,
    createdAt: formatDate(d.createdAt),
    campaignTitle: items.map((it) => it.campaignTitle).filter(Boolean).join("، "),
    itemCount: String(items.length),
    items,
  };
}

function donationsToContext(donations: RawDonation[]): TemplateDonation[] {
  return donations.map(donationToContext);
}

function userToContext(
  u: { id: string; name: string | null; email: string | null; phone: string | null; countryName: string | null; country: string | null; countryCode: string | null; city: string | null; region: string | null; preferredLang: string | null }
): TemplateUser {
  return {
    id: u.id,
    name: u.name ?? "",
    email: u.email ?? "",
    phone: u.phone ?? "",
    countryName: u.countryName ?? u.country ?? "",
    countryCode: u.countryCode ?? "",
    city: u.city ?? "",
    region: u.region ?? "",
    preferredLang: u.preferredLang ?? "",
  };
}

export async function loadContext(userId: string): Promise<TemplateContext | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: userSelect,
  });
  if (!user) return null;

  const donations = await prisma.donation.findMany({
    where: { donorId: userId, status: "PAID" },
    select: donationSelect,
    orderBy: { createdAt: "desc" },
  });

  const totalUSD = donations.reduce((s, d) => s + (d.amountUSD ?? 0), 0);
  const lastAt = donations[0]?.createdAt ?? null;

  return {
    user: userToContext(user),
    donations: donationsToContext(donations as RawDonation[]),
    totals: {
      count: String(donations.length),
      amountUSD: formatNumber(totalUSD, 0),
      lastAt: formatDate(lastAt),
    },
  };
}

/**
 * Loads context for a single donation as the focus event (used by event triggers).
 * The donor's full PAID history is also exposed via {{#donations}} so templates
 * built for manual sends still work in trigger flows.
 */
export async function loadContextForDonation(
  donationId: string
): Promise<TemplateContext | null> {
  const donation = await prisma.donation.findUnique({
    where: { id: donationId },
    select: { ...donationSelect, donorId: true },
  });
  if (!donation) return null;
  const base = await loadContext(donation.donorId);
  if (!base) return null;
  return {
    ...base,
    donation: donationToContext(donation as RawDonation),
  };
}

export async function loadContextsForUserIds(
  ids: string[]
): Promise<Map<string, TemplateContext>> {
  if (ids.length === 0) return new Map();
  const [users, donations] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids } }, select: userSelect }),
    prisma.donation.findMany({
      where: { donorId: { in: ids }, status: "PAID" },
      select: { ...donationSelect, donorId: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const byDonor = new Map<string, RawDonation[]>();
  for (const d of donations) {
    const arr = byDonor.get(d.donorId) ?? [];
    arr.push(d as RawDonation);
    byDonor.set(d.donorId, arr);
  }

  const out = new Map<string, TemplateContext>();
  for (const u of users) {
    const ds = byDonor.get(u.id) ?? [];
    const totalUSD = ds.reduce((s, d) => s + (d.amountUSD ?? 0), 0);
    const lastAt = ds[0]?.createdAt ?? null;
    out.set(u.id, {
      user: userToContext(u),
      donations: donationsToContext(ds),
      totals: {
        count: String(ds.length),
        amountUSD: formatNumber(totalUSD, 0),
        lastAt: formatDate(lastAt),
      },
    });
  }
  return out;
}

/** ---------------- merge engine ---------------- */

const SECTION_RE = /\{\{#\s*([a-zA-Z0-9_.]+)\s*\}\}([\s\S]*?)\{\{\/\s*\1\s*\}\}/g;
const VAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

function lookup(path: string, scope: Record<string, unknown>): unknown {
  const parts = path.split(".");
  let cur: unknown = scope;
  for (const p of parts) {
    if (cur && typeof cur === "object" && p in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[p];
    } else {
      return undefined;
    }
  }
  return cur;
}

function renderInScope(template: string, scope: Record<string, unknown>): string {
  // Expand sections (loops) first  recursively, so nested loops work.
  const expanded = template.replace(SECTION_RE, (_, path: string, inner: string) => {
    const target = lookup(path, scope);
    if (!Array.isArray(target)) return "";
    return target
      .map((item) => {
        const childScope =
          item != null && typeof item === "object"
            ? { ...scope, ...(item as Record<string, unknown>) }
            : { ...scope, item };
        return renderInScope(inner, childScope);
      })
      .join("");
  });
  return expanded.replace(VAR_RE, (_, name: string) => {
    const v = lookup(name, scope);
    return v == null ? "" : String(v);
  });
}

export function mergeText(template: string, ctx: TemplateContext): string {
  if (!template) return template;
  const scope: Record<string, unknown> = {
    user: ctx.user,
    totals: ctx.totals,
    donations: ctx.donations,
    donation: ctx.donation,
    update: ctx.update,
  };
  return renderInScope(template, scope);
}

/** Walks a TReaderDocument JSON tree and merges every string leaf. */
export function mergeDocument<T>(doc: T, ctx: TemplateContext): T {
  if (doc == null) return doc;
  if (typeof doc === "string") return mergeText(doc, ctx) as unknown as T;
  if (Array.isArray(doc)) return doc.map((x) => mergeDocument(x, ctx)) as unknown as T;
  if (typeof doc === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(doc as Record<string, unknown>)) {
      out[k] = mergeDocument(v, ctx);
    }
    return out as unknown as T;
  }
  return doc;
}
