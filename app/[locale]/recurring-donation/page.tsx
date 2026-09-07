import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { buildPageMetadata } from "@/lib/seo";
import { listProjects } from "@/lib/minbar/projects";
import { slugFor } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import RecurringPage from "@/components/minbar/recurring/RecurringPage";

interface Props {
  params: Promise<{ locale: string }>;
}

/** The page's own namespaces, on top of the shell bundle. */
const NAMESPACES = ["recurring", "quran"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "recurring" });
  return buildPageMetadata(locale, {
    title: `${t("title1")} ${t("title2")}`,
    description: t("lead").slice(0, 165),
    path: `/${slugFor("recurring", locale)}`,
  });
}

/**
 * Recurring giving — ported from `Minbar/التبرع الدوري.dc.html`.
 */
export default async function Recurring({ params }: Props) {
  const { locale } = await params;
  const projects = await listProjects(locale);

  return (
    <MinbarMessages locale={locale} namespaces={NAMESPACES}>
      <RecurringPage projects={projects} />
    </MinbarMessages>
  );
}
