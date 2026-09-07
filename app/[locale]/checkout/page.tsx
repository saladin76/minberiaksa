import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { listProjects } from "@/lib/minbar/projects";
import { banksFor } from "@/lib/minbar/banks";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import CheckoutPage from "@/components/minbar/checkout/CheckoutPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["cart", "validation"] as const;

/**
 * Payment details are per-donor and must never be indexed
 * (`PRODUCTION_SEO_CONTRACT.md` § Indexing rules).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Donor details and payment — ported from `Minbar/بيانات الدفع.dc.html`.
 *
 * A signed-in donor's name, email and phone are pre-filled from their account
 * (`[AUTH-INTEGRATION]`), so they are not asked for details the site already
 * holds.
 */
export default async function Checkout({ params }: Props) {
  const { locale } = await params;
  const [projects, session] = await Promise.all([listProjects(locale), getServerSession(authOptions)]);

  const user = session?.user as
    | { name?: string | null; email?: string | null; phone?: string | null }
    | undefined;

  // `name` is a single field on the session; split on the first space so the
  // two inputs start populated rather than one holding the whole name.
  const [firstName = "", ...restName] = (user?.name ?? "").trim().split(/\s+/);
  const donor = user
    ? {
        firstName,
        lastName: restName.join(" "),
        email: user.email ?? "",
        phone: user.phone ?? "",
      }
    : null;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <CheckoutPage projects={projects} banks={banksFor(locale)} donor={donor} />
    </MinbarMessages>
  );
}
