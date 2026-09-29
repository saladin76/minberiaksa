import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { pickTranslation } from "@/lib/i18n/translation-fallback";
import { pickLocaleSlug } from "@/lib/slug";
import { miaPath } from "@/lib/minbar/routes";
import { SITE_URL } from "@/lib/seo";
import type { TemplateUpdate } from "@/lib/templates/variables";
import { AUDIENCE_SELECTION_MAX } from "./audience-limits";
import { AUDIENCE_LIST_PREFIX, addDonorMembers, createAudienceList } from "./audience-list-service";
import { createCampaign } from "./campaign-service";

/**
 * "Send this update to the people who made it happen."
 *
 * A campaign Update (a post from the field) becomes a real email marketing
 * campaign  a `CommunicationCampaign` in DRAFT, pointed at an audience list
 * of every donor with a settled donation to that campaign, using an email
 * template that places the update's content wherever the team put the
 * `{{update.*}}` variables. From there it goes through the ordinary campaign
 * workflow (review → approve → send / schedule) on the marketing dashboard.
 *
 * The link lives in `CommunicationCampaign.metadata.sourceUpdate`; the send
 * executor reads it and gives each recipient the update in their language
 * (`loadUpdateSource` + `updateContextFor`).
 */

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null };

export interface SourceUpdateMeta {
  updateId: string;
  campaignId: string;
  updateTitle: string;
  campaignTitle: string;
}

export function sourceUpdateOf(metadata: unknown): SourceUpdateMeta | null {
  const meta = metadata && typeof metadata === "object" ? (metadata as Record<string, unknown>).sourceUpdate : null;
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  return typeof m.updateId === "string" && typeof m.campaignId === "string"
    ? { updateId: m.updateId, campaignId: m.campaignId, updateTitle: String(m.updateTitle ?? ""), campaignTitle: String(m.campaignTitle ?? "") }
    : null;
}

// ── Audience ────────────────────────────────────────────────────────────────

/** Every donor with a settled (PAID, paidAt set) donation to this campaign. */
export async function listCampaignDonorIds(campaignId: string): Promise<string[]> {
  const rows = await prisma.donation.findMany({
    where: { status: "PAID", paidAt: { not: null }, items: { some: { campaignId } } },
    select: { donorId: true },
    distinct: ["donorId"],
  });
  return rows.map((r) => r.donorId);
}

// ── The update, per language ────────────────────────────────────────────────

export interface UpdateSource {
  id: string;
  title: string;
  description: string;
  image: string | null;
  videoUrl: string | null;
  createdAt: Date;
  translations: Array<{ locale: string; title: string; description: string }>;
  campaign: {
    id: string;
    title: string;
    slug: string | null;
    translations: Array<{ locale: string; title: string; slug: string | null }>;
  };
}

export async function loadUpdateSource(updateId: string): Promise<UpdateSource | null> {
  if (!/^[0-9a-fA-F]{24}$/.test(updateId)) return null;
  return prisma.update.findUnique({
    where: { id: updateId },
    select: {
      id: true,
      title: true,
      description: true,
      image: true,
      videoUrl: true,
      createdAt: true,
      translations: { select: { locale: true, title: true, description: true } },
      campaign: {
        select: { id: true, title: true, slug: true, translations: { select: { locale: true, title: true, slug: true } } },
      },
    },
  });
}

/**
 * A still for a video, since email cannot play one: YouTube's thumbnail, or
 * a frame of an uploaded (Cloudinary) video. Other hosts have no public still.
 */
export function videoThumbnailFor(videoUrl: string | null | undefined): string {
  if (!videoUrl) return "";
  try {
    const url = new URL(videoUrl);
    const host = url.hostname.replace(/^www\.|^m\./, "");
    if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
      let id = url.searchParams.get("v");
      if (!id && host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
      if (!id) id = url.pathname.match(/\/(?:shorts|embed|live)\/([^/?]+)/)?.[1] ?? null;
      return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : "";
    }
    if (host === "res.cloudinary.com" && url.pathname.includes("/video/upload/")) {
      return url
        .toString()
        .replace("/video/upload/", "/video/upload/so_1,w_1200,c_limit/")
        .replace(/\.[a-z0-9]+$/i, ".jpg");
    }
  } catch {
    /* not a URL */
  }
  return "";
}

/** The `{{update.*}}` values for one recipient language. */
export function updateContextFor(source: UpdateSource, locale: string, communicationCampaignId?: string | null): TemplateUpdate {
  const t = pickTranslation(source.translations, locale);
  const campaignT = pickTranslation(source.campaign.translations, locale);
  const slug = pickLocaleSlug(source.campaign.slug, source.campaign.translations, locale) ?? source.campaign.id;
  const page = `${SITE_URL}${miaPath("projectDetail", locale, encodeURIComponent(slug))}`;
  /* UTM tags: the campaign-attribution service credits donations whose
     utm_campaign is this communication campaign's id. */
  const utm = communicationCampaignId
    ? `?utm_source=email&utm_medium=communication&utm_campaign=${encodeURIComponent(communicationCampaignId)}&utm_content=update`
    : "";
  const thumbnail = videoThumbnailFor(source.videoUrl);
  let date = source.createdAt.toISOString().slice(0, 10);
  try {
    date = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(source.createdAt);
  } catch {
    /* unknown locale: ISO date */
  }
  return {
    title: t?.title || source.title,
    description: t?.description || source.description,
    image: source.image ?? "",
    videoUrl: source.videoUrl ?? "",
    videoThumbnail: thumbnail,
    cover: source.image || thumbnail,
    date,
    campaignTitle: campaignT?.title || source.campaign.title,
    url: `${page}${utm}#updates`,
    donateUrl: `${page}${utm}`,
  };
}

// ── Templates ───────────────────────────────────────────────────────────────

/** A template "is an update template" when it places any {{update.*}} variable. */
export function usesUpdateVariables(value: unknown): boolean {
  try {
    return JSON.stringify(value ?? "").includes("{{update.");
  } catch {
    return false;
  }
}

function block(type: string, props: Record<string, unknown>, style: Record<string, unknown> = {}) {
  return { type, data: { props, style: { padding: { top: 12, bottom: 12, right: 24, left: 24 }, ...style } } };
}

/** The starter update email for one language direction. Every piece is a variable the team can move or restyle. */
function starterDocument(copy: { greeting: string; watch: string; thanks: string; follow: string; donate: string }, rtl: boolean) {
  const align = rtl ? "right" : "left";
  return {
    root: {
      type: "EmailLayout",
      data: {
        backdropColor: "#F4F1EA",
        canvasColor: "#FFFFFF",
        textColor: "#10212B",
        fontFamily: "MODERN_SANS",
        childrenIds: ["upd-campaign", "upd-greeting", "upd-title", "upd-cover", "upd-body", "upd-video", "upd-thanks", "upd-follow", "upd-donate"],
      },
    },
    "upd-campaign": block("Text", { text: "{{update.campaignTitle}} · {{update.date}}" }, { textAlign: align, color: "#8A5D16", fontSize: 13, fontWeight: "bold", padding: { top: 24, bottom: 0, right: 24, left: 24 } }),
    "upd-greeting": block("Text", { text: copy.greeting }, { textAlign: align, color: "#374151", fontSize: 15 }),
    "upd-title": block("Heading", { text: "{{update.title}}", level: "h2" }, { textAlign: align, padding: { top: 4, bottom: 8, right: 24, left: 24 } }),
    "upd-cover": block("Image", { url: "{{update.cover}}", alt: "{{update.title}}", linkHref: "{{update.url}}", contentAlignment: "middle" }),
    "upd-body": block("Text", { text: "{{update.description}}", markdown: true }, { textAlign: align, color: "#374151", fontSize: 15 }),
    "upd-video": block(
      "Button",
      { text: copy.watch, url: "{{update.videoUrl}}", buttonStyle: "rounded", size: "medium", fullWidth: false, buttonBackgroundColor: "#10212B", buttonTextColor: "#FFFFFF" },
      { textAlign: "center" }
    ),
    "upd-thanks": block("Text", { text: copy.thanks }, { textAlign: align, color: "#10212B", fontSize: 15, fontWeight: "bold" }),
    "upd-follow": block(
      "Button",
      { text: copy.follow, url: "{{update.url}}", buttonStyle: "rounded", size: "medium", fullWidth: true, buttonBackgroundColor: "#A93428", buttonTextColor: "#FFFFFF" },
      { textAlign: "center" }
    ),
    "upd-donate": block("Text", { text: `[${copy.donate}]({{update.donateUrl}})`, markdown: true }, { textAlign: "center", fontSize: 13, color: "#6B7280", padding: { top: 0, bottom: 28, right: 24, left: 24 } }),
  };
}

/**
 * Create the ready-made update template (Arabic, with an English version).
 * An ordinary email template afterwards: the team edits it in the template
 * editor like any other, moving the {{update.*}} variables where they want.
 */
export function starterUpdateDocuments() {
  const ar = starterDocument(
    {
      greeting: "السلام عليكم {{user.name}}،",
      watch: "▶ شاهد الفيديو",
      thanks: "هذا ما صنعه تبرعك. جزاك الله خيرًا.",
      follow: "تابع مسيرة المشروع",
      donate: "ساهم مرة أخرى في هذا المشروع",
    },
    true
  );
  const en = starterDocument(
    {
      greeting: "Assalamu alaikum {{user.name}},",
      watch: "▶ Watch the video",
      thanks: "This is what your donation made possible. Thank you.",
      follow: "Follow the project",
      donate: "Give to this project again",
    },
    false
  );
  return { ar, en };
}

export async function createStarterUpdateTemplate(actor: Actor): Promise<{ id: string; name: string }> {
  const { ar, en } = starterUpdateDocuments();
  const row = await prisma.emailTemplate.create({
    data: {
      name: "تحديث مشروع  للمتبرعين",
      subject: "{{update.title}}  {{update.campaignTitle}}",
      document: ar as unknown as Prisma.InputJsonValue,
      translations: { en: { subject: "{{update.title}}  {{update.campaignTitle}}", document: en } } as unknown as Prisma.InputJsonValue,
      createdById: actor.actorId && /^[0-9a-fA-F]{24}$/.test(actor.actorId) ? actor.actorId : null,
      kind: "CAMPAIGN",
      status: "READY",
      purpose: "MARKETING",
      preheader: "{{update.campaignTitle}}",
    },
    select: { id: true, name: true },
  });
  return row;
}

// ── The campaign ────────────────────────────────────────────────────────────

export type CreateUpdateCampaignResult =
  | { ok: true; campaignId: string; listId: string; added: number; donors: number; truncated: boolean }
  | { ok: false; status: number; error: string };

/**
 * Create the email campaign for an update: the donors' audience list, then
 * the DRAFT campaign on it with the chosen template. Nothing is sent here
 * sending is the ordinary, explicitly approved step on the campaigns page.
 */
export async function createUpdateEmailCampaign(
  input: { updateId: string; templateId: string; name: string },
  actor: Actor
): Promise<CreateUpdateCampaignResult> {
  const source = await loadUpdateSource(input.updateId);
  if (!source) return { ok: false, status: 404, error: "التحديث غير موجود." };
  if (!/^[0-9a-fA-F]{24}$/.test(input.templateId)) return { ok: false, status: 400, error: "اختر قالب بريد." };
  const template = await prisma.emailTemplate.findUnique({ where: { id: input.templateId }, select: { id: true } });
  if (!template) return { ok: false, status: 404, error: "القالب غير موجود." };
  const name = input.name.trim();
  if (!name) return { ok: false, status: 400, error: "اسم الحملة مطلوب." };

  const donors = await listCampaignDonorIds(source.campaign.id);
  if (!donors.length) return { ok: false, status: 400, error: "لا يوجد متبرعون لهذا المشروع بعد." };

  const list = await createAudienceList(
    {
      name: `متبرعو «${source.campaign.title}»  ${source.title}`.slice(0, 160),
      description: `أُنشئت تلقائيًا من تحديث المشروع (${source.id}): كل من تبرّع لهذا المشروع تبرعًا مؤكدًا.`,
      type: "CUSTOM",
      channels: ["EMAIL"],
    },
    actor
  );
  if (!list.ok) return list;
  const listId = list.data.id;

  const members = await addDonorMembers(listId, donors, actor);
  if (!members.ok) return members;

  const sourceUpdate: SourceUpdateMeta = {
    updateId: source.id,
    campaignId: source.campaign.id,
    updateTitle: source.title,
    campaignTitle: source.campaign.title,
  };
  const campaign = await createCampaign(
    {
      name,
      channel: "EMAIL",
      purpose: "MARKETING",
      templateGroupId: template.id,
      audienceSegmentKey: `${AUDIENCE_LIST_PREFIX}${listId}`,
      metadata: { sourceUpdate },
    },
    actor
  );
  if (!campaign.ok) return campaign;

  return {
    ok: true,
    campaignId: campaign.data.id,
    listId,
    added: members.data.added,
    donors: donors.length,
    truncated: donors.length > AUDIENCE_SELECTION_MAX,
  };
}
