import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectDetailExperience } from "@/components/project-detail/project-detail-sections";
import { buildProjectFaqs, getProjectDetail, type ResolvedProjectDetail } from "@/data/project-details";
import { projectMetrics } from "@/data/project-metrics";
import { getProjectBySlug, projects, type ProjectRecord } from "@/data/projects";

type ProjectPageProps = { params: Promise<{ slug: string }> };
const customDetailIds = new Set(["gaza-food-parcels", "gaza-hot-meals", "al-quds-home-restoration"]);

export function generateStaticParams() {
  return projects.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const item = getProjectBySlug(slug);
  if (!item) return { title: "المشروع غير موجود | مؤسسة منبر الأقصى الدولية" };
  const region = item.region === "gaza" ? "غزة" : item.region === "al-quds" ? "القدس" : item.region === "al-aqsa" ? "الأقصى" : "مشاريع المؤسسة";
  return { title: `${item.title.ar} | مؤسسة منبر الأقصى الدولية`, description: `${item.summary.ar} — ${region}.` };
}

function buildFallbackDetail(source: ProjectRecord): ResolvedProjectDetail {
  return {
    story: [source.summary.ar, "التفاصيل الميدانية قيد الاعتماد، وستُضاف القصة الكاملة بعد التحقق من ملف المشروع."],
    need: "تفاصيل الاحتياج قيد الاعتماد.", goal: "هدف المشروع التفصيلي قيد الاعتماد.", location: "موقع التنفيذ التفصيلي قيد التحقق.",
    currentStage: source.status === "seasonal" ? "مشروع موسمي — خطة التنفيذ قيد الاعتماد." : "تحديثات المشروع ستُضاف بعد التحقق.",
    highlight: "بيانات الأثر مطلوبة ولا تُعرض أرقام غير معتمدة.",
    impactPlan: ["اعتماد خطة المشروع", "تجهيز متطلبات التنفيذ", "تنفيذ النشاط وفق الأولويات الميدانية", "توثيق التنفيذ والمتابعة"],
    updates: [],
    proofItems: [
      { label: "صور التنفيذ", status: source.image ? "verification" : "later", note: source.image ? "مصدر مؤقت يحتاج اعتمادًا نهائيًا." : "سيُضاف لاحقًا." },
      { label: "تقرير ميداني", status: "later", note: "DOCUMENT PREVIEW REQUIRED" },
      { label: "مصدر البيانات", status: "verification", note: "قيد التحقق." },
    ],
    media: [{ kind: "image", label: "وسائط ميدانية إضافية", requirement: "APPROVED FIELD MEDIA REQUIRED" }],
    acceptsGift: true, isFallback: true,
  };
}

function relatedScore(current: ProjectRecord, candidate: ProjectRecord) {
  let score = candidate.region === current.region ? 6 : 0;
  score += candidate.donationTypes.filter((type) => current.donationTypes.includes(type)).length * 3;
  score += candidate.tags.filter((tag) => current.tags.includes(tag)).length;
  if (candidate.featured) score += 1;
  return score;
}

export default async function ProjectDetailPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const item = getProjectBySlug(slug);
  if (!item) notFound();
  const detail = customDetailIds.has(item.id) ? getProjectDetail(item) : buildFallbackDetail(item);
  const metric = projectMetrics.find((entry) => entry.projectId === item.id);
  const relatedProjects = projects.filter((candidate) => candidate.id !== item.id).map((candidate) => ({ candidate, score: relatedScore(item, candidate) })).sort((a, b) => b.score - a.score).slice(0, 3).map(({ candidate }) => candidate);
  return <ProjectDetailExperience project={item} detail={detail} metric={metric} relatedProjects={relatedProjects} faqs={buildProjectFaqs(item)} />;
}
