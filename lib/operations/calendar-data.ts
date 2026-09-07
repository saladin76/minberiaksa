export type OperationsCalendarEvent = {
  id: string;
  title: string;
  category: "RELIGIOUS" | "CAMPAIGN" | "CONTENT" | "OPERATIONS";
  dateLabel: string;
  hijriLabel?: string;
  leadTimeDays: number;
  priority: "HIGH" | "MEDIUM" | "LOW";
  focus: string;
  requiredAssets: string[];
};

export const operationsCalendarEvents: OperationsCalendarEvent[] = [
  {
    id: "ramadan-prep",
    title: "الاستعداد لرمضان",
    category: "RELIGIOUS",
    dateLabel: "قبل رمضان بـ 45 يوم",
    hijriLabel: "شعبان / رمضان",
    leadTimeDays: 45,
    priority: "HIGH",
    focus: "زكاة، إفطار، صدقة يومية، تبرع متكرر",
    requiredAssets: ["10 فيديوهات قصيرة", "12 تصميم", "6 كاروسيل", "4 رسائل واتساب"],
  },
  {
    id: "dhul-hijjah-prep",
    title: "الاستعداد لعشر ذي الحجة",
    category: "RELIGIOUS",
    dateLabel: "قبل ذي الحجة بـ 35 يوم",
    hijriLabel: "ذو القعدة / ذو الحجة",
    leadTimeDays: 35,
    priority: "HIGH",
    focus: "الأضاحي، الوقف، التذكير اليومي، تقارير الأثر",
    requiredAssets: ["8 فيديوهات", "10 تصاميم", "5 كاروسيل", "رسائل متابعة للمتبرعين"],
  },
  {
    id: "friday-giving",
    title: "تذكير الجمعة",
    category: "CAMPAIGN",
    dateLabel: "كل خميس قبل الجمعة",
    hijriLabel: "أسبوعي",
    leadTimeDays: 2,
    priority: "MEDIUM",
    focus: "رسالة قصيرة للتبرع، وقف، صدقة جارية",
    requiredAssets: ["رسالة واتساب", "تصميم ستوري", "نص SMS قصير"],
  },
  {
    id: "gaza-week",
    title: "أسبوع غزة العاجلة",
    category: "CAMPAIGN",
    dateLabel: "الأسبوع الثاني من الخطة الشهرية",
    leadTimeDays: 14,
    priority: "HIGH",
    focus: "إغاثة غذائية، مواد ميدانية، فيديوهات إثبات أثر",
    requiredAssets: ["3 فيديوهات ميدانية", "5 تصاميم", "2 كاروسيل", "تقرير أثر مختصر"],
  },
  {
    id: "waqf-week",
    title: "أسبوع الوقف للقدس",
    category: "CONTENT",
    dateLabel: "الأسبوع الثالث من الخطة الشهرية",
    leadTimeDays: 21,
    priority: "MEDIUM",
    focus: "شرح الوقف، الشهادات، السهم الوقفي، المتر الوقفي",
    requiredAssets: ["فيديو تعريفي", "تصميم شهادة", "كاروسيل شرح", "رسالة بريدية"],
  },
];

export const operationsAlertRules = [
  "التنبيه الأول قبل الموسم بمدة كافية لتجهيز الفكرة والنصوص.",
  "التنبيه الثاني قبل الإنتاج للتأكد من التصميم والمونتاج.",
  "التنبيه الثالث قبل التسليم للتسويق وربط الروابط والحملات.",
  "أي اقتراح AI لاحقًا يكون Draft ويحتاج مراجعة بشرية قبل الاعتماد.",
] as const;
