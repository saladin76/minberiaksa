import "server-only";

import { prisma } from "@/lib/prisma";
import { writeAuditLog } from "@/lib/audit-log";
import { getActiveMetaWhatsappRuntimeConfig } from "./runtime-config";
import { ensureMetaTemplate } from "./providers/meta-whatsapp/templates";
import { META_REASONS } from "./providers/meta-whatsapp/errors";
import { syncMetaWhatsappTemplates } from "./whatsapp-template-sync";
import { schemaHasInvalidMetaParameterNames } from "./meta-parameter-name";
import {
  buildAuthenticationMetaComponents,
  buildStandardMetaComponents,
  sameVariables,
  sameVariableSet,
  variableOrder,
  type AuthDraft,
  type ButtonDraft,
  type HeaderDraft,
  type VariableBinding,
} from "./meta-template-components";

type Actor = { actorId?: string | null; actorName?: string | null; actorRole?: string | null } | null;

const META_LANGUAGE: Record<string, string> = {
  ar: "ar", tr: "tr", en: "en_US", fr: "fr", de: "de", es: "es", id: "id",
  pt: "pt_BR", ur: "ur", sq: "sq", it: "it", nl: "nl", sv: "sv", no: "nb",
  da: "da", ms: "ms", ja: "ja", zh: "zh_CN", hi: "hi",
};

const SECTION_RE = /\{\{\s*[#/]\s*([a-zA-Z0-9_.]+)\s*\}\}/;

function categoryFor(template: { category: string | null; purpose: string | null; kind: string | null }) {
  const explicit = String(template.category ?? template.purpose ?? "").toUpperCase();
  if (explicit === "MARKETING") return "MARKETING" as const;
  if (explicit === "AUTHENTICATION") return "AUTHENTICATION" as const;
  if (explicit === "UTILITY" || explicit === "TRANSACTIONAL") return "UTILITY" as const;
  return template.kind === "CAMPAIGN" ? ("MARKETING" as const) : ("UTILITY" as const);
}

export type MetaPublishSummary = {
  ok: boolean;
  templateId: string;
  targets: number;
  created: number;
  existing: number;
  failed: number;
  unsupportedWabas: Array<{ businessAccountId: string; reason: string; detail?: string }>;
  statuses: Array<{ businessAccountId: string; language: string; status: string; existed: boolean; id: string | null }>;
  errors: Array<{ businessAccountId: string; language: string; reason: string; detail?: string }>;
  canonicalWabaId: string | null;
};

export async function publishWhatsappTemplateToMeta(
  templateId: string,
  actor?: Actor,
  opts: { category?: "UTILITY" | "MARKETING" | "AUTHENTICATION"; locales?: string[] } = {},
): Promise<MetaPublishSummary> {
  const summary: MetaPublishSummary = {
    ok: false, templateId, targets: 0, created: 0, existing: 0, failed: 0,
    unsupportedWabas: [], statuses: [], errors: [], canonicalWabaId: null,
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
      category: true, header: true, footerText: true, buttons: true, authentication: true,
      externalTemplateId: true, language: true, approvalStatus: true,
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

  type TranslationDraft = { body?: string; headerText?: string | null; footerText?: string | null; buttons?: ButtonDraft[] };
  const header = (template.header && typeof template.header === "object" ? template.header : { type: "NONE" }) as HeaderDraft;
  const rootButtons = (Array.isArray(template.buttons) ? template.buttons : []) as ButtonDraft[];
  const auth = (template.authentication && typeof template.authentication === "object" ? template.authentication : {}) as AuthDraft;
  const variants = new Map<string, TranslationDraft>();
  variants.set("ar", {
    body: template.body,
    headerText: header.text ?? "",
    footerText: template.footerText ?? "",
    buttons: rootButtons,
  });
  const translations = (template.translations && typeof template.translations === "object"
    ? template.translations as Record<string, TranslationDraft>
    : {});
  for (const [locale, value] of Object.entries(translations)) {
    if (value?.body?.trim()) variants.set(locale, value);
  }

  // Editing an already-published template may add just one new language. Meta treats each language
  // as a separate template variant under the same provider name, so publish only the requested
  // locales instead of touching every existing/approved variant again.
  const requestedLocales = opts.locales?.length
    ? new Set(opts.locales.map((locale) => String(locale).trim().toLowerCase()).filter(Boolean))
    : null;
  if (requestedLocales) {
    for (const locale of Array.from(variants.keys())) {
      if (!requestedLocales.has(locale)) variants.delete(locale);
    }
    if (!variants.size) {
      summary.ok = true;
      return summary;
    }
  }

  const canonicalVariables = variableOrder(template.body);
  const canonicalHeaderVariables = variableOrder(String(header.text ?? ""));
  for (const [locale, variant] of variants) {
    const body = variant.body ?? "";
    const headerText = variant.headerText ?? String(header.text ?? "");
    if (SECTION_RE.test(body) || SECTION_RE.test(headerText)) {
      summary.errors.push({
        businessAccountId: "", language: locale, reason: "UNSUPPORTED_META_SECTION",
        detail: "قوالب Meta لا تدعم حلقات {{#...}} داخل النص.",
      });
      return summary;
    }
    const bodyVariables = variableOrder(body);
    const headerVariables = variableOrder(headerText);
    const hasDynamicHeader = canonicalHeaderVariables.length > 0 || headerVariables.length > 0;
    const hasDynamicUrl = rootButtons.some((button) =>
      String(button.type ?? "").toUpperCase() === "URL" && variableOrder(String(button.url ?? "")).length > 0,
    );
    const positional = hasDynamicHeader || hasDynamicUrl;

    const bodyMatches = positional
      ? sameVariables(canonicalVariables, bodyVariables)
      : sameVariableSet(canonicalVariables, bodyVariables);
    const headerMatches = positional
      ? sameVariables(canonicalHeaderVariables, headerVariables)
      : sameVariableSet(canonicalHeaderVariables, headerVariables);

    if (!bodyMatches || !headerMatches) {
      const missingBody = canonicalVariables.filter((key) => !bodyVariables.includes(key));
      const extraBody = bodyVariables.filter((key) => !canonicalVariables.includes(key));
      const missingHeader = canonicalHeaderVariables.filter((key) => !headerVariables.includes(key));
      const extraHeader = headerVariables.filter((key) => !canonicalHeaderVariables.includes(key));
      summary.errors.push({
        businessAccountId: "",
        language: locale,
        reason: "VARIABLES_MISMATCH",
        detail: positional
          ? `اللغة ${locale}: هذا القالب يستخدم متغيرات موضعية، لذلك يجب الحفاظ على نفس المتغيرات وبنفس الترتيب.`
          : `اللغة ${locale}: يجب أن تحتوي على نفس المتغيرات. ناقص: ${[...missingBody, ...missingHeader].join(", ") || "لا يوجد"}؛ زائد: ${[...extraBody, ...extraHeader].join(", ") || "لا يوجد"}.`,
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

  // Once Meta knows this template, every new language must be published under the exact same
  // provider template name. The local editorial name may have changed, but using that changed name
  // here would create a second Meta template family instead of a new language variant.
  const existingProviderVariants = await prisma.whatsappTemplateWabaVariant.findMany({
    where: { templateId, provider: "META_WHATSAPP" },
    select: { providerTemplateName: true, componentsSchema: true },
    orderBy: { createdAt: "asc" },
  }).catch(() => []);
  const existingProviderName = existingProviderVariants[0]?.providerTemplateName?.trim() || template.name;
  const requiresParameterNameRepair = existingProviderVariants.some((row) =>
    schemaHasInvalidMetaParameterNames(row.componentsSchema)
  );
  // Provider templates are immutable after approval. If Meta previously approved a family whose
  // named placeholders exceed the send-time 20-character limit, publishing corrected components
  // under the same name only yields CONTENT_MISMATCH. Create one deterministic successor family
  // instead, then point the local WABA/language rows at it. Old provider rows remain historical only.
  const providerTemplateName = requiresParameterNameRepair
    ? `${existingProviderName.replace(/_v2$/, "").slice(0, 117)}_v2`
    : existingProviderName;

  let canonicalBindings: VariableBinding[] = [];
  for (const waba of wabas) {
    let templateManagementBlocked = false;
    for (const [locale, variant] of variants) {
      if (templateManagementBlocked) break;
      const language = META_LANGUAGE[locale] ?? locale;
      summary.targets += 1;
      let components: unknown[];
      let parameterFormat: "named" | "positional" | undefined;
      try {
        if (category === "AUTHENTICATION") {
          components = buildAuthenticationMetaComponents(auth);
          if (locale === "ar") {
            canonicalBindings = [
              { key: "otp.code", scope: "body", position: 1, exampleValue: "123456", mapping: "otp.code", validationStatus: "VALID" },
              { key: "otp.code", scope: "button.0", position: 1, exampleValue: "123456", mapping: "otp.code", validationStatus: "VALID" },
            ];
          }
        } else {
          const built = buildStandardMetaComponents({
            body: variant.body ?? "",
            header,
            headerText: variant.headerText ?? String(header.text ?? ""),
            footerText: variant.footerText ?? template.footerText ?? "",
            buttons: variant.buttons ?? rootButtons,
          });
          components = built.components;
          parameterFormat = built.parameterFormat;
          if (locale === "ar") canonicalBindings = built.bindings;
        }
      } catch (error) {
        summary.failed += 1;
        summary.errors.push({
          businessAccountId: waba,
          language,
          reason: error instanceof Error ? error.message : "TEMPLATE_COMPONENT_BUILD_FAILED",
        });
        continue;
      }

      const result = await ensureMetaTemplate({
        businessAccountId: waba,
        name: providerTemplateName,
        language,
        category,
        components,
        parameterFormat,
      }, runtime);
      if (!result.ok) {
        if (result.reason === META_REASONS.WABA_TEMPLATE_MANAGEMENT_NOT_ALLOWED) {
          /*
           * Some Meta assets (notably WABAs tied to WhatsApp Business App / restricted messaging
           * accounts) are readable and can be valid senders, but Meta explicitly forbids template
           * create/update on them (subcode 2494160). That is an account capability, not a malformed
           * draft. Stop retrying every language on that WABA, record it as unsupported, and allow
           * the same template to publish to the other eligible WABAs.
           */
          summary.unsupportedWabas.push({
            businessAccountId: waba,
            reason: result.reason,
            detail: result.detail,
          });
          templateManagementBlocked = true;
          continue;
        }
        summary.failed += 1;
        summary.errors.push({ businessAccountId: waba, language, reason: result.reason, detail: result.detail });
        continue;
      }
      if (result.existed) summary.existing += 1; else summary.created += 1;
      summary.statuses.push({
        businessAccountId: waba, language, status: result.status, existed: result.existed, id: result.id,
      });

      // Persist provider truth immediately after Meta accepts/returns the language variant.
      // This is the lifecycle boundary used by the edit guard: local drafts remain editable until
      // this row exists with a real provider id, even when a previous publish attempt failed.
      await prisma.whatsappTemplateWabaVariant.upsert({
        where: {
          templateId_provider_businessAccountId_languageCode: {
            templateId,
            provider: "META_WHATSAPP",
            businessAccountId: waba,
            languageCode: language,
          },
        },
        update: {
          providerTemplateName,
          providerTemplateId: result.id,
          locale,
          approvalStatus: result.status,
          category,
          componentsSchema: components as never,
          rejectionReason: null,
          lastSyncedAt: new Date(),
        },
        create: {
          templateId,
          provider: "META_WHATSAPP",
          businessAccountId: waba,
          providerTemplateName,
          providerTemplateId: result.id,
          languageCode: language,
          locale,
          approvalStatus: result.status,
          category,
          componentsSchema: components as never,
          rejectionReason: null,
          lastSyncedAt: new Date(),
        },
      }).catch((error: unknown) => {
        console.error("Persisting Meta WABA/language variant after publish failed", {
          templateId,
          businessAccountId: waba,
          language,
          error: error instanceof Error ? error.message : String(error),
        });
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
      externalTemplateId: template.externalTemplateId ?? first?.id ?? undefined,
      approvalStatus: template.approvalStatus ?? first?.status ?? "PENDING",
      language: template.language ?? first?.language ?? "ar",
      variables: canonicalBindings.length ? (canonicalBindings as never) : undefined,
      lastImportedAt: new Date(),
      lastSyncStatus: summary.failed
        ? (summary.statuses.length ? "partial" : "failed")
        : summary.unsupportedWabas.length
          ? (summary.statuses.length ? "partial" : "unsupported")
          : "ok",
      lastSyncError: summary.errors.length || summary.unsupportedWabas.length
        ? [
            ...summary.errors.map((e) => [e.businessAccountId, e.language, e.reason, e.detail].filter(Boolean).join(": ")),
            ...summary.unsupportedWabas.map((e) => [e.businessAccountId, e.reason, e.detail].filter(Boolean).join(": ")),
          ].join(" | ").slice(0, 1000)
        : null,
      providerRaw: {
        autoPublish: true,
        canonicalWabaId: summary.canonicalWabaId,
        targets: summary.targets,
        statuses: summary.statuses,
        unsupportedWabas: summary.unsupportedWabas,
        errors: summary.errors,
      } as never,
    },
  });

  if (summary.canonicalWabaId) {
    await syncMetaWhatsappTemplates({ actor }).catch(() => null);
  }

  /* Unsupported WABAs are not counted as provider failures: Meta has declared that account unable
     to manage templates. Publishing is successful when at least one eligible WABA variant reached
     Meta and there are no genuine request/build failures. If every active WABA is unsupported, the
     operation remains not-ready so the UI never claims the template is usable anywhere. */
  summary.ok = summary.failed === 0 && summary.statuses.length > 0;
  await writeAuditLog({
    actorId: actor?.actorId ?? undefined,
    actorName: actor?.actorName ?? undefined,
    actorRole: actor?.actorRole ?? "ADMIN",
    action: "communication.whatsapp.template.publish",
    messageAr: summary.ok
      ? summary.unsupportedWabas.length
        ? `تم إرسال قالب واتساب «${template.name}» إلى WABA المؤهلة؛ ${summary.unsupportedWabas.length} WABA لا تسمح Meta بإدارة القوالب عليها.`
        : `تم إرسال قالب واتساب «${template.name}» تلقائيًا إلى Meta (${summary.targets} نسخة).`
      : `اكتمل إرسال قالب واتساب «${template.name}» إلى Meta مع ${summary.failed} خطأ.`,
    messageEn: `WhatsApp template auto-publish: ${template.name}; created=${summary.created}, existing=${summary.existing}, failed=${summary.failed}, unsupportedWabas=${summary.unsupportedWabas.length}`,
    entityType: "WhatsappTemplate",
    entityId: templateId,
    metadata: { ...summary, externalCall: true },
    stream: "TEAM",
  }).catch(() => {});

  return summary;
}


/**
 * When a new WABA becomes active after templates already exist, backfill every template that has
 * previously been submitted to Meta. Without this, the new sender can route traffic but lacks older
 * approved templates until an operator manually edits/resubmits each one.
 */
export async function reconcilePublishedTemplatesToActiveWabas(actor?: Actor): Promise<{
  ok: boolean;
  templates: number;
  failed: number;
  failures: Array<{ templateId: string; errors: MetaPublishSummary["errors"] }>;
}> {
  const rows = await prisma.whatsappTemplate.findMany({
    where: {
      provider: "META_WHATSAPP",
      /* Backfill only templates that have already entered Meta's lifecycle somewhere. Drafts that
         have never been submitted must remain drafts and must not be published just because a new
         sender/WABA was activated. */
      OR: [
        { wabaVariants: { some: {} } },
        { variants: { some: { provider: "META_WHATSAPP" } } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  }).catch(() => []);

  const failures: Array<{ templateId: string; errors: MetaPublishSummary["errors"] }> = [];
  for (const row of rows) {
    const result = await publishWhatsappTemplateToMeta(row.id, actor);
    if (!result.ok) failures.push({ templateId: row.id, errors: result.errors });
  }

  await writeAuditLog({
    actorId: actor?.actorId ?? undefined,
    actorName: actor?.actorName ?? undefined,
    actorRole: actor?.actorRole ?? "SYSTEM",
    action: "communication.whatsapp.templates.reconcile",
    messageAr: failures.length
      ? `مزامنة القوالب مع حسابات WABA النشطة: ${rows.length - failures.length} نجح، ${failures.length} يحتاج مراجعة.`
      : `تمت مزامنة ${rows.length} قالب واتساب مع جميع حسابات WABA النشطة.`,
    messageEn: `WhatsApp template WABA reconciliation: templates=${rows.length}, failed=${failures.length}`,
    entityType: "WhatsappTemplate",
    metadata: { templates: rows.length, failed: failures.length, externalCall: rows.length > 0 },
    stream: "TEAM",
  }).catch(() => {});

  return { ok: failures.length === 0, templates: rows.length, failed: failures.length, failures };
}


/**
 * One-shot safe repair pass for provider templates that Meta marked APPROVED even though one of
 * their named placeholders is longer than the send API accepts. The publisher above versions only
 * those broken provider families and leaves all healthy templates untouched.
 */
export async function repairInvalidMetaParameterTemplates(actor?: Actor): Promise<{
  scanned: number;
  repaired: number;
  pending: number;
  failed: number;
  results: Array<{ templateId: string; ok: boolean; failed: number; created: number; existing: number }>;
}> {
  const rows = await prisma.whatsappTemplate.findMany({
    where: {
      provider: "META_WHATSAPP",
      wabaVariants: { some: { provider: "META_WHATSAPP", approvalStatus: "APPROVED" } },
    },
    select: {
      id: true,
      wabaVariants: {
        where: { provider: "META_WHATSAPP", approvalStatus: "APPROVED" },
        select: { componentsSchema: true },
      },
    },
  }).catch(() => []);

  const broken = rows.filter((row) =>
    row.wabaVariants.some((variant) => schemaHasInvalidMetaParameterNames(variant.componentsSchema))
  );
  const results: Array<{ templateId: string; ok: boolean; failed: number; created: number; existing: number }> = [];
  let repaired = 0;
  let pending = 0;
  let failed = 0;

  for (const row of broken) {
    const result = await publishWhatsappTemplateToMeta(row.id, actor);
    results.push({
      templateId: row.id,
      ok: result.ok,
      failed: result.failed,
      created: result.created,
      existing: result.existing,
    });
    if (!result.ok) {
      failed += 1;
      continue;
    }
    // New provider families normally enter PENDING first; count them separately from fully repaired
    // families so operations never interprets "submitted" as "approved".
    const allApproved = result.statuses.length > 0 && result.statuses.every((s) => s.status === "APPROVED");
    if (allApproved) repaired += 1;
    else pending += 1;
  }

  return { scanned: rows.length, repaired, pending, failed, results };
}
