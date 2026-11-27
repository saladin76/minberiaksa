import crypto from "node:crypto";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { giftCertificateToken } from "@/lib/donations/gift-certificate-token";
import { waqfGiftScope } from "@/lib/donations/waqf-gift-scope";
import { waqfGiftTitle } from "@/lib/donations/waqf-gift-delivery";
import { parseGiftOrder, type GiftCard } from "@/lib/donations/gift-order";
import { donationCampaignTitle } from "@/lib/templates/donation-projects";
import { miaPath } from "@/lib/minbar/routes";
import MinbarMessages from "@/components/minbar/MinbarMessages";
import GiftOpen from "@/components/minbar/gift/GiftOpen";

interface Props { params: Promise<{ locale: string; kind: string; id: string }>; searchParams: Promise<{ t?: string }> }
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "giftPage" });
  return { title: t("openMetaTitle"), robots: { index: false, follow: false } };
}

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

/** A stored card, validated again; an older gift without one opens with the default card. */
function storedCard(raw: unknown): GiftCard {
  const parsed = parseGiftOrder({ recipientName: "x", channels: [], card: raw });
  return parsed.ok && parsed.gift?.card ? parsed.gift.card : { occasion: "none", theme: "dome", accent: 0, font: "naskh", signature: null, anonymous: false };
}

/**
 * The page a gift's recipient opens from their WhatsApp message or email: an envelope, then the card
 * the giver designed, with their certificate and the project. Reached only with the gift's own
 * token (the certificate's), only once the donation is paid and the gift's time has come.
 */
export default async function GiftOpenPage({ params, searchParams }: Props) {
  const [{ locale, kind, id }, { t: token = "" }] = await Promise.all([params, searchParams]);
  if (!/^[a-f\d]{24}$/i.test(id) || (kind !== "p" && kind !== "w") || !token) notFound();
  const tr = await getTranslations({ locale, namespace: "giftPage" });
  const select = { id: true, donationId: true, giftRecipientName: true, giftMessage: true, giftShowAmount: true, giftCard: true, giftSendAt: true, amount: true,
    donation: { select: { paidAt: true, accessToken: true, currency: true, donor: { select: { name: true } } } } } as const;
  let view: { title: string; projectUrl: string; certificatePath: string; line: { donationId: string; giftRecipientName: string | null; giftMessage: string | null; giftShowAmount: boolean; giftCard: unknown; giftSendAt: Date | null; amount: number; donation: { paidAt: Date | null; accessToken: string | null; currency: string; donor: { name: string | null } | null } } } | null = null;
  if (kind === "p") {
    const line = await prisma.donationItem.findUnique({ where: { id }, select: { ...select, campaign: { select: { title: true, slug: true, translations: { select: { locale: true, title: true } } } } } });
    if (line && giftCertificateToken(line.id, line.donationId, line.donation.accessToken) && same(giftCertificateToken(line.id, line.donationId, line.donation.accessToken) || "", token))
      view = { line, title: donationCampaignTitle(line.campaign, locale), projectUrl: line.campaign.slug ? miaPath("projectDetail", locale, line.campaign.slug) : miaPath("projects", locale), certificatePath: "/api/gifts/" + line.id + "/certificate?giftToken=" + encodeURIComponent(token) };
  } else {
    const line = await prisma.donationWaqfItem.findUnique({ where: { id }, select: { ...select, unit: true, count: true } });
    const expected = line ? giftCertificateToken(waqfGiftScope(line.id), line.donationId, line.donation.accessToken) : "";
    if (line && expected && same(expected, token))
      view = { line, title: waqfGiftTitle(locale, line.unit, line.count), projectUrl: "/" + locale + "/msharya-alqds-alwqfy", certificatePath: "/api/gifts/waqf/" + line.id + "/certificate?giftToken=" + encodeURIComponent(token) };
  }
  if (!view || !view.line.donation.paidAt) notFound();
  const { line } = view;
  const card = storedCard(line.giftCard);
  const waiting = line.giftSendAt && line.giftSendAt.getTime() > Date.now();
  const giver = card.anonymous ? tr("anonymousName") : card.signature || (line.donation.donor?.name ?? "").trim() || tr("anonymousName");
  const amount = new Intl.NumberFormat(locale + "-u-nu-latn", { style: "currency", currency: line.donation.currency || "USD", maximumFractionDigits: 2 }).format(line.amount);
  return (
    <MinbarMessages locale={locale} namespaces={["giftPage"] as const}>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Amiri:wght@400;700&family=Aref+Ruqaa:wght@400;700&display=swap" />
      <GiftOpen locale={locale} waiting={Boolean(waiting)} card={card} recipient={line.giftRecipientName ?? ""} giver={giver} message={line.giftMessage ?? ""} giftName={view.title}
        amount={line.giftShowAmount ? amount : null} waqf={kind === "w"} certificateUrl={view.certificatePath} projectUrl={view.projectUrl} giftUrl={"/" + locale + "/gift"} />
    </MinbarMessages>
  );
}
