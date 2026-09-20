import type { Metadata } from "next";
import { headers } from "next/headers";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { resolveGeoFromRequest } from "@/lib/geo/country-from-request";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { listProjects } from "@/lib/minbar/projects";
import { listCategoryTitles } from "@/lib/minbar/category-page";
import { banksFor } from "@/lib/minbar/banks-server";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import CheckoutPage from "@/components/minbar/checkout/CheckoutPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["cart", "validation", "certificates"] as const;

/**
 * Payment details are per-donor and must never be indexed
 * (`PRODUCTION_SEO_CONTRACT.md` § Indexing rules).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The visitor's country from the request (edge headers, else an IP lookup):
 * it picks the phone field's default flag. Built as a NextRequest because the
 * geo resolver reads request headers; the URL itself is irrelevant to it.
 */
async function visitorCountry(): Promise<string | null> {
  try {
    const h = await headers();
    const geo = await resolveGeoFromRequest(new NextRequest("http://localhost/checkout", { headers: h }));
    return geo?.countryCode ?? null;
  } catch {
    return null;
  }
}

/**
 * Donor details and payment — ported from `Minbar/بيانات الدفع.dc.html`.
 *
 * A signed-in donor's name, email and phone are pre-filled from their account
 * (`[AUTH-INTEGRATION]`), so they are not asked for details the site already
 * holds.
 */
export default async function Checkout({ params }: Props) {
  const { locale } = await params;
  const [projects, categories, session, banks, ipCountry] = await Promise.all([
    listProjects(locale),
    listCategoryTitles(locale),
    getServerSession(authOptions),
    banksFor(locale),
    visitorCountry(),
  ]);

  const user = session?.user as
    | { id?: string; name?: string | null; email?: string | null; phone?: string | null }
    | undefined;

  /* The session's phone can be stale (set at sign-up, updated since); the
     account row is what the checkout stored last time, so it wins. */
  const account = user?.id
    ? await prisma.user.findUnique({ where: { id: user.id }, select: { phone: true, countryCode: true } }).catch(() => null)
    : null;

  // `name` is a single field on the session; split on the first space so the
  // two inputs start populated rather than one holding the whole name.
  const [firstName = "", ...restName] = (user?.name ?? "").trim().split(/\s+/);
  const donor = user
    ? {
        firstName,
        lastName: restName.join(" "),
        email: user.email ?? "",
        phone: account?.phone ?? user.phone ?? "",
      }
    : null;
  /* Flag order: the account's country, else where the request came from. */
  const defaultCountry = (account?.countryCode ?? ipCountry ?? "TR").toLowerCase();

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <CheckoutPage projects={projects} categories={categories} banks={banks} donor={donor} defaultCountry={defaultCountry} />
    </MinbarMessages>
  );
}
