import "server-only";

/**
 * IP → country through several geolocation databases at once.
 *
 * One provider alone was wrong too often: each licenses a different database,
 * they disagree on the edges (Palestinian, Gulf and mobile-carrier ranges in
 * particular), and the free tier of the one we used (ipapi.co) starts
 * answering "RateLimited" after a few hundred lookups a day  which read as
 * "no country" or let a stale answer stand. So the IP is asked of every
 * provider in parallel, each with a short timeout, and the country most of
 * them name wins. On a tie the more reliable provider (first in the list)
 * decides.
 *
 * Answers are kept in memory per IP for a few hours: a long-running server
 * (the VPS) asks each provider about a visitor once, not on every page.
 *
 * `IPINFO_TOKEN` (optional) lifts ipinfo's anonymous rate limit.
 */

export interface IpGeo {
  countryCode: string;
  region: string | null;
  city: string | null;
}

interface ProviderAnswer extends IpGeo {
  provider: string;
}

const TIMEOUT_MS = 2500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 5000;

const cache = new Map<string, { at: number; geo: IpGeo | null }>();

function code(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(t) && t !== "XX" && t !== "EU" && t !== "AP" ? t : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function getJson(url: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json", "User-Agent": "minberiaksa-geo/1.0" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as unknown;
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type Provider = { name: string; lookup: (ip: string) => Promise<IpGeo | null> };

/** In order of trust: on a tie, the earlier provider's answer is taken. */
const PROVIDERS: Provider[] = [
  {
    name: "ipinfo",
    lookup: async (ip) => {
      const token = process.env.IPINFO_TOKEN?.trim();
      const data = await getJson(`https://ipinfo.io/${encodeURIComponent(ip)}/json${token ? `?token=${encodeURIComponent(token)}` : ""}`);
      const cc = code(data?.country);
      return cc ? { countryCode: cc, region: text(data?.region), city: text(data?.city) } : null;
    },
  },
  {
    name: "ipapi",
    lookup: async (ip) => {
      const data = await getJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
      if (!data || data.error) return null;
      const cc = code(data.country_code);
      return cc ? { countryCode: cc, region: text(data.region), city: text(data.city) } : null;
    },
  },
  {
    name: "country.is",
    lookup: async (ip) => {
      const data = await getJson(`https://api.country.is/${encodeURIComponent(ip)}`);
      const cc = code(data?.country);
      return cc ? { countryCode: cc, region: null, city: null } : null;
    },
  },
];

/** The majority answer; ties go to the most trusted provider among the tied. */
export function pickConsensus(answers: ProviderAnswer[]): IpGeo | null {
  if (!answers.length) return null;
  const votes = new Map<string, number>();
  for (const a of answers) votes.set(a.countryCode, (votes.get(a.countryCode) ?? 0) + 1);
  const top = Math.max(...votes.values());
  const rank = (a: ProviderAnswer) => PROVIDERS.findIndex((p) => p.name === a.provider);
  const winners = answers.filter((a) => votes.get(a.countryCode) === top).sort((a, b) => rank(a) - rank(b));
  const chosen = winners[0];
  // Region and city from a provider that agrees on the country, if any has them.
  const detail = winners.find((a) => a.city || a.region) ?? chosen;
  return { countryCode: chosen.countryCode, region: detail.region, city: detail.city };
}

export async function lookupIpGeo(ip: string): Promise<IpGeo | null> {
  const hit = cache.get(ip);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.geo;

  const settled = await Promise.all(
    PROVIDERS.map(async (p) => {
      const geo = await p.lookup(ip);
      return geo ? { ...geo, provider: p.name } : null;
    })
  );
  const answers = settled.filter((a): a is ProviderAnswer => a != null);
  const geo = pickConsensus(answers);

  if (answers.length > 1 && new Set(answers.map((a) => a.countryCode)).size > 1) {
    console.warn(`[geo] providers disagree for ${ip}: ${answers.map((a) => `${a.provider}=${a.countryCode}`).join(" ")} → ${geo?.countryCode ?? "none"}`);
  }

  // A miss on every provider is remembered briefly only, so a provider outage
  // does not leave the visitor without a country for hours.
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(ip, { at: geo ? Date.now() : Date.now() - CACHE_TTL_MS + 5 * 60 * 1000, geo });
  return geo;
}
