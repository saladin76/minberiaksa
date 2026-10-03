import "server-only";

import { prisma } from "@/lib/prisma";
import { VARIABLE_CATALOG } from "@/lib/templates/variables";
import { writeAuditLog } from "@/lib/audit-log";
import { getActiveMetaWhatsappRuntimeConfig } from "./runtime-config";
import { ensureMetaTemplate } from "./providers/meta-whatsapp/templates";
import { syncMetaWhatsappTemplates } from "./whatsapp-template-sync";

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null };

const META_LANGUAGE: Record<string, string> = {
  ar: "ar", tr: "tr", en: "en_US", fr: "fr", de: "de", es: "es", id: "id",
  pt: "pt_BR", ur: "ur", sq: "sq", it: "it", nl: "nl", sv: "sv", no: "nb",
  da: "da", ms: "ms", ja: "ja", zh: "zh_CN", hi: "hi",
};

const SCALAR_RE = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;
const SECTION_RE = /\{\{\s*[#/]\s*([a-zA-Z0-9_.]+)\s*\}\}/;

const exampleByToken = (() => {
  const map = new Map<string, string>();
  for (const group of VARIABLE_CATALOG) {
    for (const entry of group.entries) {
      map.set(entry.token.replace(/[{}]/g, "").trim(), entry.exampleValue || "example");
    }
  }
  return map;
})();

function variableOrder(body: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const match of body.matchAll(SCALAR_RE)) {
    const key = match[1];
    if (!seen.has(key)) { seen.add(key); out.push(key); }
  }
  return out;
}

function toMetaBody(body: string, variables: string[]): string {
  const index = new Map(variables.map((key, i) => [key, i + 1]));
  return body.replace(SCALAR_RE, (_full, key: string) => `{{${index.get(key) ?? 1}}}`);
}

function sameVariables(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

function categoryFor(template: { category: string | null; purpose: string | null; kind: string | null }) {
  const explicit = String(template.category ?? template.purpose ?? "").toUpperCase();
  if (explicit === "MARKETING") return "MARKETING" as const;
  if (explicit === "AUTHENTICATION") return "AUTHENTICATION" as const;
  if (explicit === "UTILITY" || explicit === "TRANSACTIONAL") return "UTILITY" as const;
  return template.kind === "CAMPAIGN" ? ("MARKETING" as const) : ("UTILITY" as const);
}

function componentsFor(body: string, variables: string[], footerText?: string | null): unknown[] {
  const metaBody = toMetaBody(body, variables);
  const bodyComponent: Record<string, unknown> = { type: "BODY", text: metaBody };
  if (variables.length) {
    bodyComponent.example = {
      body_text: [variables.map((key) => exampleByToken.get(key) ?? "example")],
    };
  }
  const components: unknown[] = [bodyComponent];
  if (footerText?.trim()) components.push({ type: "FOOTER", text: footerText.trim() });
  return components;
}

export type MetaPublishSummary = {
  ok: boolean;
  templateId: string;
  targets: number;
  created: number;
  existing: number;
  failed: number;
  statuses: Array<{ businessAccountId: string; language: string; status: string; existed: boolean; id: string | null }>;
  errors: Array<{ businessAccountId: string; language: string; reason: string; detail?: string }>;
  canonicalWabaId: string | null;
};

export async function publishWhatsappTemplateToMeta(
  templateId: string,
  actor?: Actor,
  opts: { category?: "UTILITY" | "MARKETING" | "AUTHENTICATION" } = {},
): Promise<MetaPublishSummary> {
  const summary: MetaPublishSummary = {
    ok: false, templateId, targets: 0, created: 0, existing: 0, failed: 0,
    statuses: [], errors: [], canonicalWabaId: null,
  };

  const runtime = await getActiveMetaWhatsappRuntimeConfig();
  if (!runtime.configured) {
    summary.errors.push({ businessAccountId: "", language: "", reason: runtime.reason });
    return summary;
  }

  const template = await prisma.whatsappTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true, name: true, body: true, translations: true, kind: true, purpose: true,
      category: true, footerText: true,
    },
  });
  if (!template) {
    summary.errors.push({ businessAccountId: "", language: "", reason: "TEMPLATE_NOT_FOUND" });
    return summary;
  }

  if (!/^[a-z][a-z0-9_]{0,119}$/.test(template.name)) {
    summary.errors.push({
      businessAccountId: "", language: "", reason: "INVALID_META_TEMPLATE_NAME",
      detail: "استخدم اسمًا إنجليزيًا صغيرًا يبدأ بحرف ويحتوي فقط على a-z و0-9 و_.",
    });
    return summary;
  }

  const variants = new Map<string, string>();
  variants.set("ar", template.body);
  const translations = (template.translations && typeof template.translations === "object"
    ? template.translations as Record<string, { body?: string }>
    : {});
  for (const [locale, value] of Object.entries(translations)) {
    if (value?.body?.trim()) variants.set(locale, value.body.trim());
  }

  const canonicalVariables = variableOrder(template.body);
  for (const [locale, body] of variants) {
    if (SECTION_RE.test(body)) {
      summary.errors.push({
        businessAccountId: "", language: locale, reason: "UNSUPPORTED_META_SECTION",
        detail: "قوالب Meta لا تدعم حلقات {{#...}} داخل النص. استخدم متغيرًا نصيًا جاهزًا بدل الحلقة.",
      });
      return summary;
    }
    const current = variableOrder(body);
    if (!sameVariables(canonicalVariables, current)) {
      summary.errors.push({
        businessAccountId: "", language: locale, reason: "VARIABLES_MISMATCH",
        detail: "يجب أن تستخدم كل اللغات نفس المتغيرات وبنفس الترتيب حتى يظل الإرسال آمنًا.",
      });
      return summary;
    }
  }

  const senders = await prisma.communicationSender.findMany({
    where: {
      channel: "WHATSAPP", provider: "META_WHATSAPP", enabled: true, status: "ACTIVE",
      businessAccountId: { not: null },
    },
    select: { businessAccountId: true, isDefault: true },
    orderBy: [{ isDefault: "desc" }, { priority: "asc" }],
  });
  const wabas: string[] = [];
  for (const sender of senders) {
    const waba = sender.businessAccountId?.trim();
    if (waba && !wabas.includes(waba)) wabas.push(waba);
  }
  if (!wabas.length) {
    summary.errors.push({ businessAccountId: "", language: "", reason: "NO_ACTIVE_WABA" });
    return summary;
  }
  summary.canonicalWabaId = wabas[0];

  const category = opts.category ?? categoryFor(template);
  for (const waba of wabas) {
    for (const [locale, body] of variants) {
      const language = META_LANGUAGE[locale] ?? locale;
      summary.targets += 1;
      const result = await ensureMetaTemplate({
        businessAccountId: waba,
        name: template.name,
        language,
        category,
        components: componentsFor(body, canonicalVariables, template.footerText),
      }, runtime);
      if (!result.ok) {
        summary.failed += 1;
        summary.errors.push({ businessAccountId: waba, language, reason: result.reason, detail: result.detail });
        continue;
      }
      if (result.existed) summary.existing += 1; else summary.created += 1;
      summary.statuses.push({
        businessAccountId: waba, language, status: result.status, existed: result.existed, id: result.id,
      });
    }
  }

  const first = summary.statuses[0] ?? null;
  await prisma.whatsappTemplate.update({
    where: { id: templateId },
    data: {
      provider: "META_WHATSAPP",
      channel: "WHATSAPP",
      category,
      externalTemplateId: first?.id ?? undefined,
      approvalStatus: first?.status ?? "PENDING",
      language: first?.language ?? "ar",
      variables: canonicalVariables.map((key) => ({
        key,
        exampleValue: exampleByToken.get(key) ?? "example",
        mapping: key,
        validationStatus: "VALID",
      })) as never,
      lastImportedAt: new Date(),
      lastSyncStatus: summary.failed ? (summary.statuses.length ? "partial" : "failed") : "ok",
      lastSyncError: summary.errors.length
        ? summary.errors.map((e) => [e.businessAccountId, e.language, e.reason, e.detail].filter(Boolean).join(": ")).join(" | ").slice(0, 1000)
        : null,
      providerRaw: {
        autoPublish: true,
        canonicalWabaId: summary.canonicalWabaId,
        targets: summary.targets,
        statuses: summary.statuses,
        errors: summary.errors,
      } as never,
    },
  });

  if (summary.canonicalWabaId) {
    await syncMetaWhatsappTemplates({ businessAccountId: summary.canonicalWabaId, actor }).catch(() => null);
  }

  summary.ok = summary.failed === 0 && summary.statuses.length > 0;
  await writeAuditLog({
    actorId: actor?.actorId ?? undefined,
    actorName: actor?.actorName ?? undefined,
    actorRole: actor?.actorRole ?? "ADMIN",
    action: "communication.whatsapp.template.publish",
    messageAr: summary.ok
      ? `تم إرسال قالب واتساب «${template.name}» تلقائيًا إلى Meta (${summary.targets} نسخة).`
      : `اكتمل إرسال قالب واتساب «${template.name}» إلى Meta مع ${summary.failed} خطأ.`,
    messageEn: `WhatsApp template auto-publish: ${template.name}; created=${summary.created}, existing=${summary.existing}, failed=${summary.failed}`,
    entityType: "WhatsappTemplate",
    entityId: templateId,
    metadata: { ...summary, externalCall: true },
    stream: "TEAM",
  }).catch(() => {});

  return summary;
}
