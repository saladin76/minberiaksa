import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProjectDetailExperience } from "@/components/project-detail/project-detail-sections";
import { ProjectGivingRouteLinks } from "@/components/project-detail/project-giving-route-links";
import { getProjectDetail, type ResolvedProjectDetail } from "@/data/project-details";
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
  return {
    title: `${item.title.ar} | مؤسسة منبر الأقصى الدولية`,
    description: `${item.summary.ar} — ${region}.`,
  };
}

function buildFallbackDetail(source: ProjectRecord): ResolvedProjectDetail {
  return {
    story: [source.summary.ar, "نعرض هنا المعلومات المعتمدة حاليًا، وتُضاف التفاصيل الميدانية الجديدة بعد مراجعتها من فريق المؤسسة."],
    need: "يستجيب المشروع لاحتياج ميداني ضمن مجال عمله والمنطقة المستهدفة.",
    goal: "توجيه المساهمات إلى نشاط واضح ومتابعة التنفيذ بالتحديثات المتاحة.",
    location: "تُحدد منطقة التنفيذ بحسب خطة المشروع واحتياجات الميدان.",
    currentStage: source.status === "seasonal" ? "مشروع موسمي يُنفذ ضمن فترته المعتمدة." : "المشروع متاح للدعم وتُحدّث حالته عند اعتماد مستجدات التنفيذ.",
    highlight: "لا تُعرض أرقام أو نتائج قبل اعتماد مصدرها وتوثيقها.",
    impactPlan: ["مراجعة الاحتياج", "تجهيز متطلبات التنفيذ", "تنفيذ النشاط وفق الأولويات الميدانية", "توثيق التنفيذ ومتابعته"],
    updates: [],
    proofItems: [
      { label: "صور التنفيذ", status: source.image ? "verification" : "later", note: source.image ? "صورة مرتبطة بالمشروع وتخضع للمراجعة التحريرية." : "تُضاف الصور بعد اعتمادها." },
      { label: "التقرير الميداني", status: "later", note: "يُنشر التقرير عند اكتمال مراجعته واعتماده." },
      { label: "مصدر المعلومات", status: "verification", note: "تُراجع بيانات المشروع قبل نشر أي تحديث جديد." },
    ],
    media: [{ kind: "image", label: "وسائط المشروع", requirement: "تُضاف الوسائط الميدانية المعتمدة عند توفرها." }],
    acceptsGift: true,
    isFallback: true,
  };
}

function buildFaqs(source: ProjectRecord) {
  const zakat = source.donationTypes.includes("zakat");
  const recurring = source.donationTypes.includes("recurring");
  return [
    { question: "كيف تصل مساهمتي إلى هذا المشروع؟", answer: "تُسجّل مساهمتك ضمن المشروع، وتُربط بالتحديثات والتقارير التي تعتمدها المؤسسة خلال مراحل التنفيذ." },
    { question: "هل يقبل المشروع الزكاة؟", answer: zakat ? "نعم، يظهر خيار الزكاة بنية مستقلة داخل مسار التبرع." : "لا يظهر خيار الزكاة لهذا المشروع لأن بياناته الحالية لا تتضمن أهلية الزكاة." },
    { question: "هل يمكن التبرع بشكل مستمر؟", answer: recurring ? "نعم، يمكنك إنشاء خطة يومية أو كل جمعة أو شهرية من صفحة العطاء المستمر." : "هذا المشروع لا يدعم التبرع المتكرر حاليًا." },
    { question: "متى تظهر تحديثات التنفيذ؟", answer: "تُنشر التحديثات بعد مراجعتها واعتمادها من الفريق المسؤول، ولا تُعرض تواريخ أو نتائج غير موثقة." },
    { question: "هل أحصل على إيصال؟", answer: "يظهر الإيصال ضمن حساب المتبرع بعد إتمام عملية التبرع وربط نظام الدفع." },
    { question: "هل يمكن إهداء التبرع؟", answer: "يمكن اختيار الإهداء وإضافة اسم المهدى إليه ورسالة قصيرة ضمن مسار التبرع." },
  ];
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
  const relatedProjects = projects
    .filter((candidate) => candidate.id !== item.id)
    .map((candidate) => ({ candidate, score: relatedScore(item, candidate) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ candidate }) => candidate);

  return (
    <>
      <ProjectDetailExperience
        project={item}
        detail={detail}
        metric={undefined}
        relatedProjects={relatedProjects}
        faqs={buildFaqs(item)}
      />
      <ProjectGivingRouteLinks project={item} />
    </>
  );
}
