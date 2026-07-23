import type { KnowledgeArticle, KnowledgeTopic } from "@/types/knowledge";

export const knowledgeTopics: Array<{ id: KnowledgeTopic; label: string }> = [
  { id: "zakat", label: "الزكاة" },
  { id: "waqf", label: "الوقف" },
  { id: "recurring", label: "التبرع الدوري" },
  { id: "transparency", label: "التقارير والتحديثات" },
  { id: "donation-journey", label: "التبرع والدفع" },
];

export const knowledgeArticles: KnowledgeArticle[] = [
  {
    slug: "estimate-your-zakat",
    title: "كيف تحسب زكاتك؟",
    summary: "أدخل الأموال والالتزامات لتحصل على تقدير حسابي، ثم اختر مشروعًا يقبل الزكاة.",
    topic: "zakat",
    tags: ["الزكاة", "الحاسبة", "الخصوصية"],
    reviewStatus: "draft",
    readingMinutes: 4,
    sections: [
      {
        id: "purpose",
        heading: "كيف تعمل الحاسبة؟",
        paragraphs: [
          "تجمع الحاسبة القيم التي تدخلها، وتطرح الالتزامات قصيرة الأجل، ثم تحسب 2.5% من صافي المبلغ.",
          "لا تُحفظ تفاصيل أموالك في سلة التبرعات. يُضاف مبلغ الزكاة والمشروع الذي اخترته فقط.",
        ],
      },
      {
        id: "limits",
        heading: "هل الحاسبة فتوى؟",
        paragraphs: [
          "لا. النتيجة تقدير حسابي ولا تغني عن سؤال جهة شرعية عند وجود حالة خاصة أو تفاصيل غير واضحة.",
        ],
        note: "راجع جهة شرعية موثوقة عند الحاجة.",
      },
      {
        id: "journey",
        heading: "ماذا تفعل بعد الحساب؟",
        paragraphs: [
          "استخدم المبلغ المحسوب أو اكتب مبلغًا آخر، ثم اختر مشروعًا يقبل الزكاة وأضف التبرع إلى السلة.",
        ],
      },
    ],
    sources: [],
    relatedSlugs: ["follow-project-reports", "continuous-giving-plan"],
  },
  {
    slug: "waqf-versus-charity",
    title: "ما الفرق بين الوقف والصدقة الجارية؟",
    summary: "تعرّف على بيانات الوقف المطلوبة ومتى تظهر شهادته وتقاريره.",
    topic: "waqf",
    tags: ["الوقف", "صاحب الوقف", "الوثائق"],
    reviewStatus: "draft",
    readingMinutes: 4,
    sections: [
      {
        id: "path",
        heading: "كيف يُسجل الوقف؟",
        paragraphs: [
          "يُسجل الوقف كتتبرع مستقل يتضمن المشروع والمبلغ واسم صاحب الوقف ورسالة الإهداء عند إضافتها.",
          "يبقى الوقف منفصلًا عن الصدقة والزكاة داخل السلة.",
        ],
      },
      {
        id: "certificate",
        heading: "متى تظهر شهادة الوقف؟",
        paragraphs: [
          "تظهر الشهادة بعد إتمام التبرع ومراجعة البيانات وإصدارها من المؤسسة.",
        ],
      },
      {
        id: "financial",
        heading: "هل الوقف استثمار مالي؟",
        paragraphs: [
          "لا. الوقف تبرع لمشروع ذي منفعة مستمرة، ولا يقدم عائدًا ماليًا للمتبرع.",
        ],
      },
    ],
    sources: [],
    relatedSlugs: ["estimate-your-zakat", "follow-project-reports"],
  },
  {
    slug: "continuous-giving-plan",
    title: "كيف يعمل التبرع الدوري؟",
    summary: "اختر المبلغ والتكرار والمشروع، ثم راجع التفاصيل قبل الإضافة إلى السلة.",
    topic: "recurring",
    tags: ["تبرع دوري", "كل جمعة", "تبرع شهري"],
    reviewStatus: "draft",
    readingMinutes: 3,
    sections: [
      {
        id: "frequency",
        heading: "اختر التكرار",
        paragraphs: [
          "يمكنك الاختيار بين يومي، وكل جمعة، وشهري. يظهر مبلغ كل عملية قبل المتابعة.",
        ],
      },
      {
        id: "destination",
        heading: "اختر المشروع",
        paragraphs: [
          "اختر مشروعًا يقبل التبرع الدوري أو خيارًا عامًا، ثم راجع المبلغ والتكرار.",
        ],
      },
      {
        id: "activation",
        heading: "كيف تعدل أو توقف التبرع؟",
        paragraphs: [
          "بعد تفعيل الخدمة، يمكنك تعديل التبرع الدوري أو إيقافه من حسابك.",
          "لن تُطلب بيانات دفع قبل توفر طريقة دفع معتمدة.",
        ],
      },
    ],
    sources: [],
    relatedSlugs: ["estimate-your-zakat", "follow-project-reports"],
  },
  {
    slug: "follow-project-reports",
    title: "كيف أتابع تقارير المشروع؟",
    summary: "تعرّف على مكان ظهور تحديثات المشروع وتقاريره بعد اعتمادها.",
    topic: "transparency",
    tags: ["تقارير", "شفافية", "تحديثات المشاريع"],
    reviewStatus: "draft",
    readingMinutes: 4,
    sections: [
      {
        id: "project",
        heading: "ابدأ من صفحة المشروع",
        paragraphs: [
          "تعرض صفحة المشروع وصفه ومكان تنفيذه والمستفيدين والتحديثات والتقارير المتاحة.",
        ],
      },
      {
        id: "verification",
        heading: "متى يُنشر التحديث؟",
        paragraphs: [
          "تُراجع الصور والتواريخ والنتائج والوثائق قبل نشرها. قد لا تظهر تحديثات حتى تصل مادة معتمدة.",
        ],
      },
      {
        id: "account",
        heading: "أين أجد التحديثات في حسابي؟",
        paragraphs: [
          "بعد تسجيل الدخول وربط التبرعات بحسابك، تظهر التحديثات والوثائق الخاصة بالمشاريع التي دعمتها.",
        ],
      },
    ],
    sources: [],
    relatedSlugs: ["continuous-giving-plan", "waqf-versus-charity"],
  },
];

export const getKnowledgeArticle = (slug: string) => knowledgeArticles.find((article) => article.slug === slug);
