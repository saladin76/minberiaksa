import type { MarketingResultItem } from "@/lib/marketing/results/results-types";
import type { RecommendationItem } from "./recommendation-types";

export function buildMarketingResultRecommendations(results: MarketingResultItem[]): RecommendationItem[] {
  return results.flatMap((result) => {
    const recommendations: RecommendationItem[] = [];

    if (result.status === "WINNER" && result.roas >= 4) {
      recommendations.push({
        id: `scale-${result.id}`,
        area: "MARKETING",
        type: "SCALE_WINNER",
        priority: "HIGH",
        confidence: "HIGH",
        title: `زود اختبار المادة الرابحة: ${result.assetTitle}`,
        reason: `المادة حققت ROAS ${result.roas}x مع ${result.donations} تبرعات، وهذا مؤشر قوي على قابلية التوسع.`,
        suggestedAction: "كرر نفس الفكرة بنسخة أقصر ونسخة لغة أخرى، ثم زود الميزانية تدريجيًا بدل القفز المفاجئ.",
        expectedImpact: "زيادة الإيراد مع الحفاظ على تعلّم المنصة وتقليل مخاطر حرق الجمهور.",
        sourceIds: [result.id, result.archiveAssetId],
      });
    }

    if (result.clicks >= 700 && result.donations <= 5) {
      recommendations.push({
        id: `creative-${result.id}`,
        area: "MARKETING",
        type: "IMPROVE_CREATIVE",
        priority: "MEDIUM",
        confidence: "MEDIUM",
        title: `حسّن الرسالة أو الصورة: ${result.assetTitle}`,
        reason: `المادة جلبت ${result.clicks} نقرة لكن فقط ${result.donations} تبرعات، وهذا يشير إلى فجوة بين الاهتمام والتحويل.`,
        suggestedAction: "اختبر صورة ميدانية أو proof أقوى، واجعل CTA مباشرًا نحو نية تبرع واحدة.",
        expectedImpact: "رفع معدل التحويل من النقر إلى التبرع وتقليل تكلفة التبرع.",
        sourceIds: [result.id, result.archiveAssetId],
      });
    }

    if (result.status === "LOSING") {
      recommendations.push({
        id: `rework-${result.id}`,
        area: "ARCHIVE",
        type: "PAUSE_OR_REWORK",
        priority: "MEDIUM",
        confidence: "HIGH",
        title: `لا تعيد استخدام المادة كما هي: ${result.assetTitle}`,
        reason: "النتيجة الحالية ضعيفة ولا يوجد تبرعات كافية تبرر إعادة النشر بنفس الشكل.",
        suggestedAction: "حوّل المادة إلى صيغة مختلفة أو اربطها بدليل أثر أقوى قبل إعادة استخدامها.",
        expectedImpact: "منع تكرار مواد ضعيفة وتحسين جودة الأرشيف المستخدم في الحملات.",
        sourceIds: [result.id, result.archiveAssetId],
      });
    }

    if (result.channel === "WHATSAPP" && result.revenue > 0 && result.spend === 0) {
      recommendations.push({
        id: `reuse-${result.id}`,
        area: "MARKETING",
        type: "REUSE_ASSET",
        priority: "LOW",
        confidence: "MEDIUM",
        title: `حوّل قناة واتساب الناجحة إلى قالب: ${result.assetTitle}`,
        reason: `القناة حققت ${result.revenue}$ بدون إنفاق إعلاني، وهذا يجعلها مناسبة كقالب متكرر.`,
        suggestedAction: "احفظ الرسالة كقالب موسمي، واختبر عنوانًا آخر مع رابط تتبع أكثر دقة.",
        expectedImpact: "زيادة العائد من القنوات المجانية وتحسين قياس الرسائل.",
        sourceIds: [result.id, result.archiveAssetId],
      });
    }

    return recommendations;
  });
}
