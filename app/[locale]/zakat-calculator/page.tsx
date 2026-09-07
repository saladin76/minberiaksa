import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import ZakatCalculator from "@/components/minbar/zakat/ZakatCalculator";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["zakat", "homepage", "quran"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "zakat" });
  return buildPageMetadata(locale, {
    title: t("calcTitle"),
    description: t("calcLead"),
    path: `/${slugFor("zakatCalculator", locale)}`,
  });
}

/**
 * Zakat calculator — ported from `Minbar/حاسبة الزكاة.dc.html`.
 *
 * `[BACKEND-INTEGRATION]`: `DEVELOPER_HANDOFF` lists a daily gold-price API as
 * a required environment integration. Until it exists the donor enters the rate
 * per gram themselves, which is honest — the page shows no nisāb figure at all
 * rather than one computed from a stale or invented rate.
 */
export default async function ZakatCalculatorPage({ params }: Props) {
  const { locale } = await params;

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <ZakatCalculator />
    </MinbarMessages>
  );
}
