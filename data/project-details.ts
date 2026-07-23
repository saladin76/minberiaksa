import type { DonationType, ProjectRecord } from "@/data/projects";

export type ProjectUpdateStatus = "verified" | "review" | "planned" | "report" | "required";
export type ProjectUpdate = {
  id: string;
  dateLabel: string;
  stage: string;
  title: string;
  description: string;
  sourceLabel: string;
  status: ProjectUpdateStatus;
  mediaLabel?: string;
};

export type ProjectProofItem = {
  label: string;
  status: "available" | "verification" | "later" | "unavailable";
  note: string;
};

export type ProjectMediaItem = {
  kind: "image" | "video" | "before-after";
  label: string;
  requirement: string;
};

export type ProjectDetailRecord = {
  story: string[];
  need: string;
  goal: string;
  location: string;
  currentStage: string;
  highlight: string;
  impactPlan: string[];
  beneficiaries?: string[];
  updates: ProjectUpdate[];
  proofItems: ProjectProofItem[];
  media: ProjectMediaItem[];
  suggestedAmounts?: number[];
  impactByAmount?: Record<number, string>;
  acceptsGift: boolean;
};

const projectDetails: Record<string, ProjectDetailRecord> = {
  "gaza-food-parcels": {
    story: [
      "يركّز المشروع على تجهيز وتسليم طرود غذائية للعائلات المتضررة في غزة، مع إبقاء مسار التنفيذ والتسليم قابلًا للتوثيق.",
      "تُضاف التفاصيل الميدانية النهائية، ومكونات الطرد، ودورية التوزيع بعد اعتمادها من فريق المشروع.",
    ],
    need: "دعم الاحتياجات الغذائية الأساسية للعائلات المتضررة.",
    goal: "تجهيز وتسليم طرود غذائية ضمن خطة تنفيذ موثقة.",
    location: "غزة — موقع التنفيذ التفصيلي قيد الاعتماد.",
    currentStage: "قيد التنفيذ وجمع التحديثات الميدانية.",
    highlight: "كل تحديث منشور يجب أن يرتبط بمصدر ميداني معتمد.",
    impactPlan: ["اعتماد مكونات الطرود والكميات", "تجهيز المواد وتعبئتها", "تنظيم التسليم للفئات المستحقة", "توثيق التنفيذ والتسليم"],
    beneficiaries: ["العائلات المتضررة", "الأسر ذات الاحتياج الغذائي"],
    updates: [
      { id: "parcels-plan", dateLabel: "التاريخ مطلوب", stage: "التجهيز", title: "خطة تجهيز الطرود", description: "يُضاف نطاق التجهيز والكميات بعد اعتماد الفريق الميداني.", sourceLabel: "مصدر التوثيق مطلوب", status: "planned", mediaLabel: "APPROVED FIELD MEDIA REQUIRED" },
      { id: "parcels-delivery", dateLabel: "التاريخ مطلوب", stage: "التسليم", title: "توثيق التسليم", description: "ستظهر صور أو تقارير التسليم بعد مراجعتها واعتمادها.", sourceLabel: "قيد المراجعة", status: "review" },
    ],
    proofItems: [
      { label: "صور التنفيذ", status: "verification", note: "توجد إحالة إلى مصدر ميداني مؤقت وتحتاج اعتمادًا نهائيًا." },
      { label: "إثبات التسليم", status: "later", note: "سيُضاف بعد اعتماد دفعة التنفيذ." },
      { label: "تقرير المشروع", status: "later", note: "DOCUMENT PREVIEW REQUIRED" },
      { label: "جهة التنفيذ", status: "verification", note: "بيانات الجهة المنفذة قيد التحقق." },
    ],
    media: [
      { kind: "image", label: "صور تجهيز الطرود", requirement: "Approved field images · verified source · independent mobile crop" },
      { kind: "video", label: "فيديو التسليم", requirement: "Approved field reel required" },
    ],
    suggestedAmounts: [70, 140, 350],
    acceptsGift: true,
  },
  "gaza-hot-meals": {
    story: [
      "يدعم المشروع المطابخ الميدانية وتوفير وجبات ساخنة للأسر في مناطق النزوح.",
      "تفاصيل مواقع المطابخ، وعدد الوجبات، ودورية التنفيذ تبقى قيد الاعتماد ولا تُعرض كأرقام نهائية قبل التحقق.",
    ],
    need: "توفير وجبات جاهزة للأسر في مناطق النزوح.",
    goal: "دعم دورة التجهيز والطهي والتوزيع مع توثيق التنفيذ.",
    location: "غزة — مواقع التنفيذ التفصيلية قيد الاعتماد.",
    currentStage: "حملة مستمرة مع تحديثات تنفيذ مطلوبة.",
    highlight: "لا تُعرض أعداد الوجبات كحقائق نهائية قبل ربطها بالتقارير.",
    impactPlan: ["تجهيز المواد الغذائية", "دعم تشغيل المطابخ الميدانية", "توزيع الوجبات وفق الخطة", "نشر تحديثات التنفيذ"],
    beneficiaries: ["الأسر في مناطق النزوح", "العائلات المتضررة"],
    updates: [],
    proofItems: [
      { label: "صور التنفيذ", status: "later", note: "سيُضاف ألبوم معتمد من الفريق الميداني." },
      { label: "تقرير ميداني", status: "later", note: "DOCUMENT PREVIEW REQUIRED" },
      { label: "مصدر البيانات", status: "verification", note: "قيد الربط بالتقارير الرسمية." },
    ],
    media: [{ kind: "video", label: "من المطبخ إلى التوزيع", requirement: "APPROVED FIELD REEL REQUIRED" }],
    suggestedAmounts: [10, 20, 50],
    acceptsGift: true,
  },
  "al-quds-home-restoration": {
    story: [
      "يركّز المشروع على ترميم منازل الأسر المقدسية ودعم بقائهم داخل المدينة.",
      "تُعرض تفاصيل نطاق الترميم، والأعمال الفنية، والجدول التنفيذي فقط بعد اعتماد ملف المشروع الميداني.",
    ],
    need: "معالجة احتياجات ترميم منازل مقدسية وفق تقييم فني معتمد.",
    goal: "تنفيذ أعمال ترميم موثقة تساعد الأسرة على البقاء في منزل آمن.",
    location: "القدس — موقع المنزل لا يُنشر قبل اعتماد ضوابط الخصوصية.",
    currentStage: "ملفات الترميم والتوثيق قيد المراجعة.",
    highlight: "خصوصية العائلات ومصدر الصور جزء أساسي من اعتماد التوثيق.",
    impactPlan: ["تقييم الاحتياج الفني", "اعتماد نطاق الأعمال والمواد", "تنفيذ أعمال الترميم", "توثيق المراحل والتسليم"],
    beneficiaries: ["العائلات المقدسية المستفيدة من المشروع"],
    updates: [
      { id: "restoration-assessment", dateLabel: "التاريخ مطلوب", stage: "التقييم", title: "التقييم الفني للموقع", description: "تفاصيل التقييم ونطاق الأعمال ستُضاف بعد اعتماد الملف.", sourceLabel: "قيد التحقق", status: "review" },
    ],
    proofItems: [
      { label: "صور قبل التنفيذ", status: "verification", note: "مصدر مؤقت يحتاج اعتمادًا نهائيًا." },
      { label: "صور بعد التنفيذ", status: "later", note: "تُضاف بعد اكتمال المرحلة المناسبة." },
      { label: "تقرير فني", status: "later", note: "DOCUMENT PREVIEW REQUIRED" },
      { label: "إثبات التسليم", status: "later", note: "سيُضاف بعد اكتمال المشروع." },
    ],
    media: [
      { kind: "before-after", label: "قبل وبعد الترميم", requirement: "Matched approved field images required" },
      { kind: "image", label: "تفاصيل أعمال الترميم", requirement: "Approved detail crops required" },
    ],
    suggestedAmounts: [400, 800, 2000],
    acceptsGift: true,
  },
};

export type ResolvedProjectDetail = ProjectDetailRecord & { isFallback: boolean };

export function getProjectDetail(project: ProjectRecord): ResolvedProjectDetail {
  const detail = projectDetails[project.id];
  if (detail) return { ...detail, isFallback: false };
  return {
    story: [project.summary.ar, "التفاصيل الميدانية قيد الاعتماد، وستُضاف القصة الكاملة بعد التحقق من ملف المشروع."],
    need: "تفاصيل الاحتياج قيد الاعتماد.",
    goal: "هدف المشروع التفصيلي قيد الاعتماد.",
    location: "موقع التنفيذ التفصيلي قيد التحقق.",
    currentStage: project.status === "seasonal" ? "مشروع موسمي — خطة التنفيذ قيد الاعتماد." : "تحديثات المشروع ستُضاف بعد التحقق.",
    highlight: "بيانات الأثر مطلوبة ولا تُعرض أرقام غير معتمدة.",
    impactPlan: ["اعتماد خطة المشروع", "تجهيز متطلبات التنفيذ", "تنفيذ النشاط وفق الأولويات الميدانية", "توثيق التنفيذ والمتابعة"],
    updates: [],
    proofItems: [
      { label: "صور التنفيذ", status: project.image ? "verification" : "later", note: project.image ? "مصدر مؤقت يحتاج اعتمادًا نهائيًا." : "سيُضاف لاحقًا." },
      { label: "تقرير ميداني", status: "later", note: "DOCUMENT PREVIEW REQUIRED" },
      { label: "مصدر البيانات", status: "verification", note: "قيد التحقق." },
    ],
    media: [{ kind: "image", label: "وسائط ميدانية إضافية", requirement: "APPROVED FIELD MEDIA REQUIRED" }],
    acceptsGift: true,
    isFallback: true,
  };
}

export function buildProjectFaqs(project: ProjectRecord) {
  const accepts = (type: DonationType) => project.donationTypes.includes(type);
  return [
    { question: "كيف تصل مساهمتي إلى هذا المشروع؟", answer: "تُضاف مساهمتك إلى مسار المشروع، وتُربط مراحل التنفيذ والتوثيق بالتحديثات الرسمية عند اعتمادها." },
    { question: "هل يقبل المشروع الزكاة؟", answer: accepts("zakat") ? "نعم، يظهر خيار الزكاة داخل لوحة التبرع مع نية مستقلة وإيصال زكاة منفصل في التجربة الكاملة." : "لا يظهر خيار الزكاة لهذا المشروع لأن بياناته الحالية لا تتضمن أهلية الزكاة." },
    { question: "هل يمكن التبرع بشكل مستمر؟", answer: accepts("recurring") ? "نعم، يمكنك اختيار عطاء يومي أو كل جمعة أو شهريًا داخل النموذج التجريبي." : "هذا المشروع لا يدعم التبرع المتكرر حاليًا، ويمكن استكشاف مشاريع أخرى تقبل العطاء المستمر." },
    { question: "متى تظهر تحديثات التنفيذ؟", answer: "تظهر التحديثات بعد اعتمادها من الفريق الميداني، ولا تُنشر تواريخ أو نتائج غير موثقة." },
    { question: "هل أحصل على إيصال؟", answer: "توضح الواجهة أن إيصالًا سيصدر في التجربة الكاملة بعد ربط نظام الدفع، ولا يتم إنشاء إيصال حقيقي في هذا النموذج." },
    { question: "هل يمكن إهداء التبرع؟", answer: "يمكن إعداد معاينة بطاقة إهداء داخل النموذج، دون إرسال بريد أو إنشاء PDF حقيقي." },
  ];
}
