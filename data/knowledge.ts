import type { KnowledgeArticle, KnowledgeTopic } from "@/types/knowledge";

export const knowledgeTopics: Array<{ id: KnowledgeTopic; label: string }> = [
  { id: "zakat", label: "الزكاة" },
  { id: "waqf", label: "الوقف" },
  { id: "recurring", label: "العطاء المستمر" },
  { id: "transparency", label: "الشفافية والتقارير" },
  { id: "donation-journey", label: "رحلة التبرع" },
];

export const knowledgeArticles: KnowledgeArticle[] = [
  {
    slug: "estimate-your-zakat",
    title: "كيف تستخدم حاسبة الزكاة التقديرية؟",
    summary: "شرح لطريقة إدخال الأصول والالتزامات ومراجعة النتيجة قبل اختيار مسار الزكاة.",
    topic: "zakat",
    tags: ["الزكاة", "الحاسبة", "الخصوصية"],
    reviewStatus: "draft",
    readingMinutes: 4,
    sections: [
      {
        id: "purpose",
        heading: "ما الذي تفعله الحاسبة؟",
        paragraphs: [
          "تجمع الحاسبة القيم التي تدخلها، وتطرح الالتزامات قصيرة الأجل، ثم تعرض تقديرًا حسابيًا بنسبة 2.5% من صافي المال المدخل.",
          "لا تحفظ المنصة تفاصيل أصولك داخل سلة العطاء، ويصل إلى السلة مبلغ الزكاة والمسار الذي اخترته فقط.",
        ],
      },
      {
        id: "limits",
        heading: "ما الذي لا تحدده الحاسبة؟",
        paragraphs: [
          "لا تتحقق الحاسبة تلقائيًا من جميع الشروط الخاصة بحالتك، ولا تقدم فتوى أو بديلًا عن الاستشارة المختصة عند وجود تفاصيل غير واضحة.",
        ],
        note: "استخدم النتيجة كتقدير حسابي، وراجع الجهة الشرعية التي تثق بها عند الحاجة.",
      },
      {
        id: "journey",
        heading: "بعد ظهور النتيجة",
        paragraphs: [
          "يمكنك استخدام المبلغ المحسوب أو إدخال مبلغ مختلف، ثم تأكيد نية الزكاة واختيار الصندوق أو المشروع المؤهل قبل إضافته إلى سلة العطاء.",
        ],
      },
    ],
    sources: [],
    relatedSlugs: ["follow-project-reports", "continuous-giving-plan"],
  },
  {
    slug: "waqf-versus-charity",
    title: "كيف يختلف مسار الوقف داخل المنصة؟",
    summary: "دليل تشغيلي يوضح البيانات المطلوبة لإنشاء مساهمة وقفية ومتابعة وثائقها لاحقًا.",
    topic: "waqf",
    tags: ["الوقف", "صاحب الوقف", "الوثائق"],
    reviewStatus: "draft",
    readingMinutes: 4,
    sections: [
      {
        id: "path",
        heading: "مسار مستقل داخل سلة العطاء",
        paragraphs: [
          "يُسجل الوقف كعنصر مستقل يتضمن المشروع أو المسار، والمبلغ، واسم صاحب الوقف، ونص الإهداء عند إضافته.",
          "لا تختلط بيانات الوقف بعناصر الصدقة أو الزكاة الموجودة في السلة نفسها.",
        ],
      },
      {
        id: "certificate",
        heading: "متى تظهر شهادة الوقف؟",
        paragraphs: [
          "لا تُعرض شهادة نهائية قبل إتمام العملية ومراجعة البيانات وإصدار الوثيقة من النظام التشغيلي للمؤسسة.",
        ],
      },
      {
        id: "financial",
        heading: "مساهمة وليست منتجًا ماليًا",
        paragraphs: [
          "تجربة الوقف في الموقع مخصصة للعطاء المرتبط بالمشروع، ولا تعرض أرباحًا أو عائدًا ماليًا للمتبرع.",
        ],
      },
    ],
    sources: [],
    relatedSlugs: ["estimate-your-zakat", "follow-project-reports"],
  },
  {
    slug: "continuous-giving-plan",
    title: "كيف تنشئ خطة عطاء مستمر؟",
    summary: "اختر الدورية والجهة والمبلغ، ثم راجع التقدير قبل الانتقال إلى سلة العطاء.",
    topic: "recurring",
    tags: ["عطاء مستمر", "كل جمعة", "تبرع شهري"],
    reviewStatus: "draft",
    readingMinutes: 3,
    sections: [
      {
        id: "frequency",
        heading: "اختر الدورية المناسبة",
        paragraphs: [
          "تتيح الواجهة الاختيار بين يومي، وكل جمعة، وشهري. يعرض الملخص قيمة كل عملية وتقديرًا شهريًا وسنويًا يساعدك على مراجعة الخطة.",
        ],
      },
      {
        id: "destination",
        heading: "حدد جهة العطاء",
        paragraphs: [
          "يمكن توجيه الخطة إلى صندوق عام أو مشروع يقبل العطاء المستمر. تبقى الجهة والمبلغ والدورية ظاهرة قبل المتابعة.",
        ],
      },
      {
        id: "activation",
        heading: "تفعيل الخطة وإدارتها",
        paragraphs: [
          "يحتاج الخصم المتكرر وإدارة المواعيد والإيقاف إلى بوابة دفع وحساب متبرع مرتبطين بالنظام التشغيلي.",
          "لا تطلب الواجهة الحالية بيانات بطاقة قبل اكتمال هذا الربط.",
        ],
      },
    ],
    sources: [],
    relatedSlugs: ["estimate-your-zakat", "follow-project-reports"],
  },
  {
    slug: "follow-project-reports",
    title: "كيف تتابع تحديثات وتقارير المشروع؟",
    summary: "تعرف على العلاقة بين صفحة المشروع والتحديث الميداني والتقرير وحساب المتبرع.",
    topic: "transparency",
    tags: ["تقارير", "شفافية", "تحديثات المشاريع"],
    reviewStatus: "draft",
    readingMinutes: 4,
    sections: [
      {
        id: "project",
        heading: "صفحة المشروع هي المرجع الأساسي",
        paragraphs: [
          "تعرض صفحة المشروع هدفه ومسار التنفيذ والتحديثات المتاحة وحالة التوثيق. لا تُصنف المرحلة كمكتملة لمجرد وجود المشروع في الموقع.",
        ],
      },
      {
        id: "verification",
        heading: "مراجعة التحديث قبل النشر",
        paragraphs: [
          "تُراجع الصور والتواريخ والنتائج والوثائق قبل ربطها بالمشروع. قد يظهر المشروع دون تحديثات إلى أن تصل مادة مناسبة للنشر.",
        ],
      },
      {
        id: "account",
        heading: "المتابعة داخل حساب العطاء",
        paragraphs: [
          "بعد تفعيل الحساب وربطه بالعمليات الفعلية، يمكن عرض التحديثات والوثائق المرتبطة بمساهمات المتبرع من مساحة واحدة.",
        ],
      },
    ],
    sources: [],
    relatedSlugs: ["continuous-giving-plan", "waqf-versus-charity"],
  },
];

export const getKnowledgeArticle = (slug: string) => knowledgeArticles.find((article) => article.slug === slug);