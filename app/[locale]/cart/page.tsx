import type { Metadata } from "next";
import { listProjects } from "@/lib/minbar/projects";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import CartPage from "@/components/minbar/cart/CartPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["cart", "certificates"] as const;

/**
 * The cart is per-donor and must never be indexed
 * (`PRODUCTION_SEO_CONTRACT.md` § Indexing rules).
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

/**
 * Giving basket — ported from `Minbar/السلة.dc.html`.
 *
 * The project list is fetched here so the cart can resolve each row's title
 * live in the active locale. The cart contents themselves live in
 * `localStorage` and are read after hydration — the server cannot know them.
 */
export default async function Cart({ params }: Props) {
  const { locale } = await params;
  const projects = await listProjects(locale);

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <CartPage projects={projects} />
    </MinbarMessages>
  );
}
