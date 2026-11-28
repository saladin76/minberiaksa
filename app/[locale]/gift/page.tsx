import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { listProjects } from "@/lib/minbar/projects";
import { WAQF_MAX_COUNT, WAQF_UNIT_PRICE_USD } from "@/lib/minbar/waqf";
import { publicGiftSettings } from "@/lib/minbar/gift-settings-service";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import GiftPage, { type GiftCatalog } from "@/components/minbar/gift/GiftPage";

interface Props { params: Promise<{ locale: string }> }
const NAMESPACES = ["giftPage", "cart"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "giftPage" });
  const settings = await publicGiftSettings();
  return { title: t("metaTitle"), description: t("metaDescription"), robots: settings.enabled ? undefined : { index: false, follow: false } };
}

const pick = (text: { ar: string; en: string; tr: string }, locale: string) => (locale === "ar" ? text.ar : locale === "tr" ? text.tr || text.en || text.ar : text.en || text.ar);

/**
 * The gift page: a catalog of gifts (waqf, impact, open) chosen by intention, with a designed card.
 * Hidden until the dashboard switches it on (صفحة الإهداء); before that only admins see it. Every
 * value offered comes from the dashboard; waqf units keep the waqf page's prices.
 */
export default async function Gift({ params }: Props) {
  const { locale } = await params;
  const [settings, session] = await Promise.all([publicGiftSettings(), getServerSession(authOptions)]);
  const admin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  if (!settings.enabled && !admin) notFound();
  const published = await listProjects(locale);
  const byId = new Map(published.map((p) => [p.id.toLowerCase(), p]));
  const open = settings.openProjectId ? byId.get(settings.openProjectId.toLowerCase()) : undefined;
  const catalog: GiftCatalog = {
    amounts: settings.amounts,
    waqf: { share: settings.waqf.share ? WAQF_UNIT_PRICE_USD.share : null, meter: settings.waqf.meter ? WAQF_UNIT_PRICE_USD.meter : null, intentions: settings.waqf.intentions, max: WAQF_MAX_COUNT },
    impact: settings.impactGifts.flatMap((g) => { const p = byId.get(g.projectId.toLowerCase()); return p ? [{ id: g.id, slug: p.slug, project: p.title, name: pick(g.name, locale), note: pick(g.note, locale), icon: g.icon, intentions: g.intentions }] : []; }),
    open: open ? { slug: open.slug, title: open.title } : null,
  };
  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      {/* The card's naskh and ruqaa faces; the page falls back to the site font if they cannot load. */}
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Aref+Ruqaa:wght@400;700&display=swap" />
      <GiftPage locale={locale} preview={!settings.enabled} catalog={catalog} />
    </MinbarMessages>
  );
}
