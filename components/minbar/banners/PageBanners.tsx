import { listBanners } from "@/lib/minbar/banners";
import type { BannerSlotKey } from "@/lib/minbar/banner-placements";
import SiteBanner from "./SiteBanner";

/**
 * A banner slot on a public page — server component. Reads the banners the
 * dashboard placed on `<page>:<slot>` (and `all:<slot>`) for this locale and
 * renders them in drag order, so they are in the first HTML like the rest of
 * the page. Renders nothing at all when the slot is empty: no wrapper, no gap.
 *
 * Every pair a page mounts must exist in `lib/minbar/banner-placements.ts`,
 * or the dashboard cannot target it.
 */
export default async function PageBanners({ locale, page, slot }: { locale: string; page: string; slot: BannerSlotKey }) {
  const banners = await listBanners(locale, page, slot);
  if (!banners.length) return null;
  return (
    <>
      {banners.map((b) => (
        <SiteBanner key={b.id} banner={b} />
      ))}
    </>
  );
}
