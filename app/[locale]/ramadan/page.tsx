import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { getTranslations } from "next-intl/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/options";
import { listProjects } from "@/lib/minbar/projects";
import { publicRamadanSettings } from "@/lib/minbar/ramadan-settings-service";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import RamadanPage from "@/components/minbar/ramadan/RamadanPage";

interface Props { params: Promise<{ locale: string }> }
const NAMESPACES = ["ramadan", "cart", "DonationDialog"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "ramadan" });
  const settings = await publicRamadanSettings();
  return { title: t("metaTitle"), description: t("metaDescription"), robots: settings.enabled ? undefined : { index: false, follow: false } };
}

/**
 * Ramadan scheduling (phase 2c). Hidden until the dashboard switches the service on; before that
 * only admins see it, to test with real cards. Plans are created by /api/ramadan/plans.
 */
export default async function Ramadan({ params }: Props) {
  const { locale } = await params;
  const [settings, session] = await Promise.all([publicRamadanSettings(), getServerSession(authOptions)]);
  const admin = (session?.user as { role?: string } | undefined)?.role === "ADMIN";
  if (!settings.enabled && !admin) notFound();
  const published = await listProjects(locale);
  const byId = new Map(published.map((p) => [p.id.toLowerCase(), p]));
  const projects = settings.projectIds.map((id) => byId.get(id.toLowerCase())).filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ id: p.id, title: p.title, note: (p.text || "").slice(0, 90) }));
  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <RamadanPage locale={locale} signedIn={Boolean(session?.user?.id)} preview={!settings.enabled}
        settings={{ amounts: settings.amounts, doubleLast10: settings.doubleLast10, startDate: settings.startDate, hijriYear: settings.hijriYear, startConfirmed: settings.startConfirmed }}
        projects={projects} />
    </MinbarMessages>
  );
}
