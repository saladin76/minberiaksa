import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { listProjects } from "@/lib/minbar/projects";
import { publicGiftSettings } from "@/lib/minbar/gift-settings-service";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import GiftPage from "@/components/minbar/gift/GiftPage";

interface Props { params: Promise<{ locale: string }> }
const NAMESPACES = ["giftPage", "cart"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "giftPage" });
  const settings = await publicGiftSettings();
  return { title: t("metaTitle"), description: t("metaDescription"), robots: settings.enabled ? undefined : { index: false, follow: false } };
}

/**
 * The gift page (G2). Hidden until the dashboard switches it on (صفحة الإهداء); before that only
 * admins see it, to review it with real projects. A finished gift goes to the basket as one row per
 * recipient, with its card and delivery time, and is paid through the ordinary checkout.
 */
export default async function Gift({ params }: Props) {
  const { locale } = await params;
  const [settings, session] = await Promise.all([publicGiftSettings(), getServerSession(authOptions)]);
  const admin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  if (!settings.enabled && !admin) notFound();
  const published = await listProjects(locale);
  const byId = new Map(published.map((p) => [p.id.toLowerCase(), p]));
  const projects = settings.projectIds.map((id) => byId.get(id.toLowerCase())).filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ slug: p.slug, title: p.title }));
  const packages = settings.packages.map((pk) => { const p = byId.get(pk.projectId.toLowerCase()); return p ? { slug: p.slug, title: p.title, note: (p.text || "").slice(0, 70), price: pk.price, icon: pk.icon } : null; })
    .filter((p): p is NonNullable<typeof p> => Boolean(p));
  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <GiftPage locale={locale} preview={!settings.enabled} amounts={settings.amounts} projects={projects} packages={packages} />
    </MinbarMessages>
  );
}
