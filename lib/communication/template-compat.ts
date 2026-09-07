import type { TReaderDocument } from "@usewaypoint/email-builder";
import { prisma } from "@/lib/prisma";
import { DEFAULT_LOCALE, isValidLocale, type SupportedLocale } from "@/lib/locales";
import { resolveEmailVariant, resolveWhatsappBody } from "@/lib/templates/locale-resolver";
import { renderEmailHtml, renderEmailSubject } from "@/lib/templates/render";
import { mergeText, type TemplateContext } from "@/lib/templates/variables";
import { SAMPLE_TEMPLATE_CONTEXT } from "@/lib/templates/sample-context";
import { renderTemplatePreview } from "./template-renderer";
import type { CommunicationChannelId } from "./communication-runtime-types";

/**
 * Compatibility layer over the EmailTemplate / WhatsappTemplate / SmsTemplate models so campaigns
 * can list templates, compute language coverage against `translations`, and render per-locale
 * previews — without a dedicated CommunicationTemplateGroup model (not overbuilt).
 *
 * SMS used to borrow the WhatsApp store because both are "a text body". That was wrong in practice:
 * the two are authored against opposite constraints (see the `SmsTemplate` model note), and the
 * shared store meant SMS drafts appeared in the WhatsApp list as unapproved WhatsApp templates.
 * Each channel now reads its own store.
 */

export type ChannelTemplateSummary = {
  id: string;
  name: string;
  availableLocales: SupportedLocale[];
};

function localesFromTranslations(base: SupportedLocale, translations: unknown): SupportedLocale[] {
  const set = new Set<SupportedLocale>([base]);
  if (translations && typeof translations === "object") {
    for (const key of Object.keys(translations as Record<string, unknown>)) {
      if (isValidLocale(key)) set.add(key);
    }
  }
  return [...set];
}

/**
 * The plain-text template stores, read per channel.
 *
 * Branched explicitly rather than by picking a Prisma delegate into a variable: the two delegates
 * are structurally identical here but their generated types are not assignable to one another, so
 * a shared handle only typechecks behind a cast that would drop the `select` checking entirely.
 * Email is absent by design — it has a document, not a body.
 */
type TextTemplateSummary = { id: string; name: string; translations: unknown; kind: string | null };

async function listTextTemplates(channel: CommunicationChannelId): Promise<TextTemplateSummary[] | null> {
  const query = { select: { id: true, name: true, translations: true, kind: true }, orderBy: { createdAt: "desc" }, take: 200 } as const;
  if (channel === "WHATSAPP") return prisma.whatsappTemplate.findMany(query);
  if (channel === "SMS") return prisma.smsTemplate.findMany(query);
  return null;
}

async function findTextTemplate(
  channel: CommunicationChannelId,
  id: string,
): Promise<{ name: string; body: string; translations: unknown } | null> {
  const query = { where: { id }, select: { name: true, body: true, translations: true } } as const;
  if (channel === "WHATSAPP") return prisma.whatsappTemplate.findUnique(query);
  if (channel === "SMS") return prisma.smsTemplate.findUnique(query);
  return null;
}

/**
 * Ids of templates that are SYSTEM (platform-event) templates — either flagged `kind = "SYSTEM"`
 * or referenced by a MessageTrigger. Campaign Builder must not offer these by default.
 */
async function systemTemplateIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const triggers = await prisma.messageTrigger.findMany({ select: { templateId: true } }).catch(() => []);
  for (const t of triggers) ids.add(t.templateId);
  return ids;
}

/**
 * List CAMPAIGN templates for the given channel (SYSTEM templates are excluded by default so they
 * never appear in Campaign Builder). Pass `{ includeSystem: true }` only for admin/template tooling.
 */
export async function listChannelTemplates(
  channel: CommunicationChannelId,
  opts: { includeSystem?: boolean } = {}
): Promise<ChannelTemplateSummary[]> {
  if (!process.env.DATABASE_URL) return [];
  try {
    const systemIds = opts.includeSystem ? new Set<string>() : await systemTemplateIds();
    const keep = (row: { id: string; kind?: string | null }) =>
      opts.includeSystem || (row.kind !== "SYSTEM" && !systemIds.has(row.id));

    const textRows = await listTextTemplates(channel);
    if (textRows) {
      return textRows.filter(keep).map((t) => ({ id: t.id, name: t.name, availableLocales: localesFromTranslations(DEFAULT_LOCALE, t.translations) }));
    }
    const rows = await prisma.emailTemplate.findMany({
      select: { id: true, name: true, translations: true, kind: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return rows.filter(keep).map((t) => ({ id: t.id, name: t.name, availableLocales: localesFromTranslations(DEFAULT_LOCALE, t.translations) }));
  } catch (error) {
    console.error("listChannelTemplates failed", error);
    return [];
  }
}

export async function getTemplateAvailableLocales(channel: CommunicationChannelId, templateId: string): Promise<SupportedLocale[]> {
  const list = await listChannelTemplates(channel);
  return list.find((t) => t.id === templateId)?.availableLocales ?? [];
}

export type RenderedTemplate = {
  channel: CommunicationChannelId;
  locale: SupportedLocale;
  resolvedLocale: SupportedLocale;
  usedFallback: boolean;
  subject: string | null;
  body: string;
  variables: string[];
  templateName: string;
};

/**
 * Render a template for one locale.
 *
 * Two callers with opposite needs share this function, and conflating them was a live send bug:
 *
 *  - **Preview** (no `ctx`): merge sample values, touch no donor data.
 *  - **Send** (`ctx` supplied): merge that recipient's real data.
 *
 * Without `ctx` it previously did preview-only work for *both*, so campaigns went out with sample
 * variable values — every donor greeted by the sample name — and the email body was a literal
 * placeholder sentence rather than the template. `ctx` is what separates the two, and the email
 * branch now renders the actual builder document through the same `renderEmailHtml` the trigger
 * dispatcher uses, so a campaign email and a triggered email are produced by one code path.
 */
export async function renderChannelTemplate(
  channel: CommunicationChannelId,
  templateId: string,
  locale: SupportedLocale,
  ctx?: TemplateContext | null
): Promise<RenderedTemplate | null> {
  if (!process.env.DATABASE_URL) return null;
  try {
    if (channel === "WHATSAPP" || channel === "SMS") {
      const tpl = await findTextTemplate(channel, templateId);
      if (!tpl) return null;
      const variant = resolveWhatsappBody(tpl, locale);
      const preview = renderTemplatePreview(variant.body);
      return {
        channel,
        locale,
        resolvedLocale: variant.resolvedLocale,
        usedFallback: variant.resolvedLocale !== locale,
        subject: null,
        body: ctx ? mergeText(variant.body, ctx) : preview.rendered,
        variables: preview.variables,
        templateName: tpl.name,
      };
    }
    const tpl = await prisma.emailTemplate.findUnique({ where: { id: templateId }, select: { name: true, subject: true, document: true, translations: true } });
    if (!tpl) return null;
    const variant = resolveEmailVariant(tpl, locale);
    const subjectPreview = renderTemplatePreview(variant.subject);
    // Sample context for previews so the body is real HTML either way — an empty-looking preview
    // is what let the placeholder survive unnoticed.
    const renderCtx = ctx ?? SAMPLE_TEMPLATE_CONTEXT;
    const html = await renderEmailHtml(variant.document as TReaderDocument, renderCtx);
    return {
      channel,
      locale,
      resolvedLocale: variant.resolvedLocale,
      usedFallback: variant.resolvedLocale !== locale,
      subject: ctx ? renderEmailSubject(variant.subject, ctx) : subjectPreview.rendered,
      body: html,
      variables: subjectPreview.variables,
      templateName: tpl.name,
    };
  } catch (error) {
    console.error("renderChannelTemplate failed", error);
    return null;
  }
}
