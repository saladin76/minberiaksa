import type { KnowledgeArticle, KnowledgeTopic } from "@/types/knowledge";

export const knowledgeTopics: Array<{ id: KnowledgeTopic; label: string }> = [
  { id: "zakat", label: "الزكاة" },
  { id: "waqf", label: "الوقف" },
  { id: "recurring", label: "التبرع المستمر" },
  { id: "al-quds", label: "القدس والأقصى" },
  { id: "gaza", label: "غزة والإغاثة" },
  { id: "transparency", label: "الشفافية والتقارير" },
  { id: "donation-journey", label: "رحلة التبرع" },
];

export const knowledgeArticles: KnowledgeArticle[] = [
  {
    slug: "estimate-your-zakat",
    title: "كيف تحسب زكاتك تقديريًا؟",
    summary: "دليل عملي لفهم الحاسبة التقديرية مع الحفاظ على نية الزكاة مستقلة.",
    topic: "zakat",
    tags: ["زكاة", "حاسبة", "نية التبرع"],
    projectId: "gaza-food-parcels",
    reviewStatus: "sharia-review-required",
    readingMinutes: 5,
    sections: [
      { id: "purpose", heading: "ما الذي تقدمه الحاسبة؟", paragraphs: ["تقدّم الحاسبة نتيجة تقديرية مبنية على البيانات التي يدخلها المستخدم، ولا تستبدل الاستشارة الشرعية عند الحاجة."] },
      { id: "nisab", heading: "النصاب والبيانات الاختيارية", paragraphs: ["يمكن إدخال النصاب بصورة اختيارية وفق منطق النموذج الحالي، مع إبقاء النتيجة واضحة داخل لوحة منفصلة."] },
      { id: "intention", heading: "حفظ نية الزكاة", paragraphs: ["تبقى مساهمة الزكاة منفصلة داخل السلة ويؤكد المستخدم النية قبل الإضافة."], note: "النص يحتاج مراجعة شرعية قبل النشر العام." },
    ],
    sources: [],
    relatedSlugs: ["waqf-versus-charity", "follow-project-reports"],
  },
  {
    slug: "waqf-versus-charity",
    title: "ما الفرق بين الوقف والصدقة؟",
    summary: "مقدمة تحريرية تساعد المتبرع على فهم مسار الوقف دون إنشاء حكم شرعي جديد.",
    topic: "waqf",
    tags: ["وقف", "صدقة", "شهادة الوقف"],
    projectId: "al-quds-home-restoration",
    reviewStatus: "sharia-review-required",
    readingMinutes: 4,
    sections: [
      { id: "overview", heading: "مساران للعطاء", paragraphs: ["تشرح هذه الصفحة الفرق التشغيلي داخل المنصة فقط: مساهمة مباشرة في مشروع، أو إنشاء وقف مرتبط بخيار معتمد وشهادة بعد المراجعة."] },
      { id: "certificate", heading: "شهادة الوقف", paragraphs: ["شهادة الوقف معاينة إلى أن تكتمل البيانات والدفع والمراجعة والإصدار الرسمي."] },
    ],
    sources: [],
    relatedSlugs: ["estimate-your-zakat", "continuous-giving-plan"],
  },
  {
    slug: "continuous-giving-plan",
    title: "كيف يعمل العطاء المستمر؟",
    summary: "شرح لنموذج الخطة اليومية أو الأسبوعية أو الشهرية بوصفه Prototype دون خصم فعلي.",
    topic: "recurring",
    tags: ["عطاء مستمر", "خطة", "تبرع شهري"],
    projectId: "gaza-water",
    reviewStatus: "institution-approved",
    readingMinutes: 4,
    sections: [
      { id: "frequency", heading: "اختر الدورية", paragraphs: ["تتيح الواجهة اختيار تبرع يومي أو كل جمعة أو شهري مع عرض ملخص شهري وسنوي تقديري."] },
      { id: "prototype", heading: "حالة النموذج", paragraphs: ["لا يتم تنفيذ خصم تلقائي أو إنشاء خطة حقيقية في هذه النسخة الأمامية."] },
    ],
    sources: ["واجهة العطاء المستمر داخل المنصة"],
    relatedSlugs: ["follow-project-reports", "estimate-your-zakat"],
  },
  {
    slug: "follow-project-reports",
    title: "كيف تصل إلى تقارير مشروعك؟",
    summary: "تعرف إلى العلاقة بين المشروع والتحديث الميداني والوثائق وتقارير الأثر.",
    topic: "transparency",
    tags: ["تقارير", "شفافية", "أثر"],
    projectId: "al-quds-home-restoration",
    reviewStatus: "sources-required",
    readingMinutes: 5,
    sections: [
      { id: "journey", heading: "من المشروع إلى التقرير", paragraphs: ["يرتبط كل تحديث بمعرّف مشروع موجود، ثم تظهر حالة التوثيق والوثيقة المرتبطة دون اختراع نتيجة أو رقم."] },
      { id: "states", heading: "حالات التحقق", paragraphs: ["قد يظهر العنصر موثّقًا أو قيد المراجعة أو تقريرًا قيد الإعداد أو بيانات مطلوبة."] },
    ],
    sources: [],
    relatedSlugs: ["continuous-giving-plan", "waqf-versus-charity"],
  },
];

export const getKnowledgeArticle = (slug: string) => knowledgeArticles.find((article) => article.slug === slug);
