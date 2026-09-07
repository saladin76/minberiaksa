/**
 * Rule-based quality recommendations for WhatsApp templates.
 *
 * Inputs are intentionally minimal so callers can pass either an imported
 * Twilio template (no perf data yet) or a local template with attached
 * `TemplatePerformance` metrics. Each rule produces a typed card the UI can
 * render in the preview drawer.
 */
import type {
  NormalizedButton,
  NormalizedHeader,
  WhatsappTemplateKind,
} from "./twilio-templates";

export type TemplateRecommendationKind =
  | "shorten_opening"
  | "add_cta_button"
  | "scale_media"
  | "test_image_instead_of_video"
  | "simplify_document"
  | "improve_first_sentence"
  | "fix_landing_or_payment"
  | "review_audience_quality"
  | "scale_winning_cta";

export type TemplateRecommendationSeverity = "positive" | "warning" | "info";

export interface TemplateRecommendation {
  id: string;
  kind: TemplateRecommendationKind;
  severity: TemplateRecommendationSeverity;
  title: string;
  body: string;
}

export interface TemplatePerformance {
  sent: number;
  delivered: number;
  failed: number;
  clicked: number;
  donations: number;
  revenueUSD: number;
}

export interface TemplateRecommendationInput {
  body: string;
  templateType: WhatsappTemplateKind;
  header: NormalizedHeader | null;
  buttons: NormalizedButton[];
  performance?: TemplatePerformance | null;
}

const BODY_TOO_LONG = 480; // chars — beyond this users start scrolling
const OPENING_TOO_LONG = 90; // first sentence chars

function firstSentence(body: string): string {
  const m = /^[\s\S]*?[.!?؟،\n]/.exec(body);
  return (m ? m[0] : body).trim();
}

export function computeTemplateRecommendations(
  input: TemplateRecommendationInput
): TemplateRecommendation[] {
  const out: TemplateRecommendation[] = [];
  const body = input.body ?? "";
  const opening = firstSentence(body);
  const hasButtons = input.buttons.length > 0;
  const hasDonateBtn = input.buttons.some(
    (b) =>
      b.type === "donation_cta" ||
      /donate|تبرع|donation/i.test(b.text + " " + (b.url ?? ""))
  );

  if (body.length > BODY_TOO_LONG) {
    out.push({
      id: "shorten_opening",
      kind: "shorten_opening",
      severity: "warning",
      title: "النص طويل جدًا",
      body: "اختصر الفقرة الأولى حتى لا يضطر المستلم للتمرير قبل رؤية CTA.",
    });
  } else if (opening.length > OPENING_TOO_LONG) {
    out.push({
      id: "improve_first_sentence",
      kind: "improve_first_sentence",
      severity: "info",
      title: "حسّن الجملة الافتتاحية",
      body: "الجملة الأولى أطول من سطر — جرب 6-12 كلمة بحدّ أقصى.",
    });
  }

  if (!hasButtons) {
    out.push({
      id: "add_cta_button",
      kind: "add_cta_button",
      severity: "warning",
      title: "لا يوجد زر CTA",
      body: "أضف زر URL واضح للتبرع (مثلاً «تبرع الآن») لتحسين معدّل النقر.",
    });
  } else if (!hasDonateBtn && input.templateType !== "text") {
    out.push({
      id: "add_cta_button",
      kind: "add_cta_button",
      severity: "info",
      title: "ضع CTA تبرع واضح",
      body: "لا يوجد زر تبرع صريح — صنف زر URL كزر تبرع لتسهيل القياس.",
    });
  }

  const perf = input.performance;
  if (perf && perf.sent >= 50) {
    const deliveryRate = perf.delivered / perf.sent;
    const clickRate = perf.delivered > 0 ? perf.clicked / perf.delivered : 0;
    const donationRate = perf.clicked > 0 ? perf.donations / perf.clicked : 0;
    const failureRate = perf.failed / perf.sent;

    if (failureRate >= 0.2) {
      out.push({
        id: "review_audience_quality",
        kind: "review_audience_quality",
        severity: "warning",
        title: "نسبة فشل عالية",
        body: "أكثر من 20٪ من الإرسالات فشلت — راجع جودة قائمة الأرقام أو أهلية WhatsApp.",
      });
    }
    if (deliveryRate >= 0.85 && clickRate <= 0.05 && hasButtons) {
      out.push({
        id: "improve_first_sentence",
        kind: "improve_first_sentence",
        severity: "warning",
        title: "وصول جيد لكن نقر منخفض",
        body: "الرسالة وصلت لكن قليل من المستلمين ضغطوا الزر — جرب جملة افتتاحية أقوى.",
      });
    }
    if (clickRate >= 0.15 && donationRate <= 0.05) {
      out.push({
        id: "fix_landing_or_payment",
        kind: "fix_landing_or_payment",
        severity: "warning",
        title: "نقر عالي وتبرع منخفض",
        body: "كثيرون نقروا لكن قلة تبرّعوا — افحص صفحة الهبوط ومسار الدفع.",
      });
    }
    if (input.templateType === "media" && clickRate >= 0.15) {
      out.push({
        id: "scale_media",
        kind: "scale_media",
        severity: "positive",
        title: "قالب وسائط ناجح",
        body: "نسبة النقر مرتفعة — كرّر صيغة الوسائط نفسها في حملات قادمة.",
      });
    }
    if (
      input.templateType === "media" &&
      input.header?.type === "video" &&
      clickRate <= 0.03
    ) {
      out.push({
        id: "test_image_instead_of_video",
        kind: "test_image_instead_of_video",
        severity: "info",
        title: "جرّب صورة بدل الفيديو",
        body: "أداء الفيديو منخفض — اختبر نسخة بصورة ثابتة.",
      });
    }
    if (
      input.templateType === "media" &&
      input.header?.type === "document" &&
      clickRate <= 0.02
    ) {
      out.push({
        id: "simplify_document",
        kind: "simplify_document",
        severity: "info",
        title: "بسّط المستند",
        body: "قالب الـ document يكلّف المستلم خطوة إضافية — جرب ملخص نصي قصير + زر URL.",
      });
    }
  }

  // Winning button — fires when one button drastically out-clicks the rest.
  // We don't have per-button clicks yet on `perf`; the rule is wired in but
  // dormant until the SentMessage schema captures `clickedButtonId`.
  return out;
}
