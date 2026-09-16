import type { Metadata } from "next";
import { listProjects } from "@/lib/minbar/projects";
import { listCategoryTitles } from "@/lib/minbar/category-page";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import CartPage from "@/components/minbar/cart/CartPage";
import PageBanners from "@/components/minbar/banners/PageBanners";

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
 * The project and category lists are fetched here so the cart can resolve each row's title
 * live in the active locale. The cart contents themselves live in
 * `localStorage` and are read after hydration — the server cannot know them.
 */
export default async function Cart({ params }: Props) {
  const { locale } = await params;
  const [projects, categories] = await Promise.all([listProjects(locale), listCategoryTitles(locale)]);

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
        <PageBanners locale={locale} page="cart" slot="top" />
      <CartPage projects={projects} categories={categories} />
      <PageBanners locale={locale} page="cart" slot="bottom" />
    </MinbarMessages>
  );
}
