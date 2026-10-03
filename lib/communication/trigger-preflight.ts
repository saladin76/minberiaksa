import "server-only";

import { prisma } from "@/lib/prisma";
import { approvedLocalesFor, getTemplateReadiness } from "./whatsapp-template-sync";
import { loadSenderRoutingSnapshot, resolveSenderFromSnapshot } from "./sender-resolution";

/**
 * Can this trigger actually send? Answered before it is switched on, not at the donor's expense.
 *
 * Enabling a WhatsApp trigger used to be a single boolean write. Nothing checked that the template
 * was a Meta template, that Meta had approved any language of it, or that a WhatsApp sender existed 
 * so a trigger could sit enabled for weeks, firing on every donation and skipping every one with
 * `META_TEMPLATE_REQUIRED_FOR_AUTOMATIC_WHATSAPP` buried in the delivery log. Donors simply never
 * received their receipts, and the dashboard showed a healthy, enabled trigger.
 *
 * The preflight is therefore a gate on activation and an advisory everywhere else: it reports what is
 * wrong in terms an operator can act on ("no Arabic variant approved", "no WhatsApp sender
 * configured"), rather than a provider error code after the fact.
 */

export type PreflightProblem = {
  code:
    | "TEMPLATE_NOT_FOUND"
    | "TEMPLATE_NOT_META"
    | "NO_APPROVED_VARIANT"
    | "NO_SENDER"
    | "PROVIDER_NOT_CONFIGURED";
  /** Reader-facing Arabic, for the dashboard. */
  messageAr: string;
  detail?: string | null;
};

export type PreflightResult = {
  ok: boolean;
  problems: PreflightProblem[];
  /** Locales this trigger can currently reach. */
  approvedLocales: string[];
  /** The provider template name and language that would be sent for Arabic. */
  canonical: { name: string; language: string } | null;
};

const READY: PreflightResult = { ok: true, problems: [], approvedLocales: [], canonical: null };

export async function preflightTrigger(input: { channel: string; templateId: string }): Promise<PreflightResult> {
  if (input.channel === "EMAIL") return preflightEmailTrigger(input.templateId);
  if (input.channel !== "WHATSAPP") return READY;
  return preflightWhatsappTrigger(input.templateId);
}

async function preflightEmailTrigger(templateId: string): Promise<PreflightResult> {
  const problems: PreflightProblem[] = [];
  const tpl = await prisma.emailTemplate.findUnique({ where: { id: templateId }, select: { id: true } }).catch(() => null);
  if (!tpl) {
    problems.push({ code: "TEMPLATE_NOT_FOUND", messageAr: "القالب غير موجود." });
    return { ok: false, problems, approvedLocales: [], canonical: null };
  }
  /* Email needs a usable sending identity, nothing more  no per-language approval exists. */
  const snapshot = await loadSenderRoutingSnapshot("EMAIL");
  const routed = resolveSenderFromSnapshot(snapshot, { purpose: "TRANSACTIONAL" });
  if (!routed.ok || !routed.sender.senderEmail) {
    problems.push({ code: "NO_SENDER", messageAr: "لا توجد هوية مُرسِل بريد مُفعّلة.", detail: routed.ok ? null : routed.reason });
  }
  return { ok: problems.length === 0, problems, approvedLocales: [], canonical: null };
}

async function preflightWhatsappTrigger(templateId: string): Promise<PreflightResult> {
  const problems: PreflightProblem[] = [];

  const tpl = await prisma.whatsappTemplate
    .findUnique({ where: { id: templateId }, select: { id: true, provider: true, name: true } })
    .catch(() => null);
  if (!tpl) {
    problems.push({ code: "TEMPLATE_NOT_FOUND", messageAr: "القالب غير موجود." });
    return { ok: false, problems, approvedLocales: [], canonical: null };
  }

  const provider = (tpl.provider ?? "").toUpperCase();
  if (provider !== "META" && provider !== "META_WHATSAPP") {
    /* A Twilio import or a MANUAL free-text template can never go out automatically: Meta refuses
       business-initiated free text, so there is no payload this trigger could ever send. */
    problems.push({
      code: "TEMPLATE_NOT_META",
      messageAr: "القالب ليس قالب Meta معتمدًا  واتساب لا يسمح بإرسال نص حر تلقائيًا.",
      detail: tpl.provider ?? "unset",
    });
  }

  const snapshot = await loadSenderRoutingSnapshot("WHATSAPP");
  const routed = resolveSenderFromSnapshot(snapshot, { locale: "ar", purpose: "TRANSACTIONAL" });

  if (!routed.ok) {
    problems.push({ code: "NO_SENDER", messageAr: "لا يوجد رقم واتساب مُفعّل يخدم هذه الرسالة.", detail: routed.reason });
    const approvedLocales = await approvedLocalesFor(templateId);
    const canonicalReadiness = await getTemplateReadiness(templateId, "ar");
    return {
      ok: false,
      problems,
      approvedLocales,
      canonical: canonicalReadiness.ready && canonicalReadiness.providerTemplateName && canonicalReadiness.languageCode
        ? { name: canonicalReadiness.providerTemplateName, language: canonicalReadiness.languageCode }
        : null,
    };
  }

  if (!routed.sender.phoneNumberId || !routed.sender.businessAccountId) {
    problems.push({
      code: "PROVIDER_NOT_CONFIGURED",
      messageAr: "رقم واتساب المُختار غير مكتمل الربط مع Meta (Phone Number ID / WABA).",
    });
  }

  const wabaId = routed.sender.businessAccountId ?? null;
  const approvedLocales = await approvedLocalesFor(templateId, wabaId);
  const canonicalReadiness = await getTemplateReadiness(templateId, "ar", wabaId);
  if (!canonicalReadiness.ready) {
    problems.push({
      code: "NO_APPROVED_VARIANT",
      messageAr: approvedLocales.length
        ? "لا توجد نسخة عربية معتمدة من هذا القالب على حساب WABA الذي سيستخدمه التوجيه."
        : "القالب غير معتمد على حساب WABA الذي سيستخدمه هذا المُرسِل؛ شغّل المزامنة وتحقق من اعتماد القالب على نفس الحساب.",
      detail: canonicalReadiness.rejectionReason ?? canonicalReadiness.reason,
    });
  }

  return {
    ok: problems.length === 0,
    problems,
    approvedLocales,
    canonical: canonicalReadiness.ready && canonicalReadiness.providerTemplateName && canonicalReadiness.languageCode
      ? { name: canonicalReadiness.providerTemplateName, language: canonicalReadiness.languageCode }
      : null,
  };
}
