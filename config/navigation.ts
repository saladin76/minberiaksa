export type NavigationItem = { label: string; href: string };

export const primaryNavigation: NavigationItem[] = [
  { label: "المشاريع", href: "#projects" },
  { label: "الزكاة", href: "#zakat" },
  { label: "الأوقاف", href: "#waqf" },
  { label: "التبرع المستمر", href: "#recurring" },
  { label: "الإنجازات", href: "#impact" },
  { label: "المعرفة", href: "#knowledge" },
  { label: "من نحن", href: "#about" },
];

export const utilityNavigation: NavigationItem[] = [
  { label: "كن شريكًا", href: "#partner" },
  { label: "تطوع معنا", href: "#volunteer" },
  { label: "استكشف مشاريع الشركاء", href: "#partner-projects" },
];

export const footerNavigation = {
  donation: { title: "التبرع", links: [
    { label: "المشاريع", href: "#projects" }, { label: "الزكاة", href: "#zakat" },
    { label: "الأوقاف", href: "#waqf" }, { label: "التبرع المستمر", href: "#recurring" },
  ]},
  trust: { title: "الثقة", links: [
    { label: "الإنجازات", href: "#impact" }, { label: "التقارير الميدانية", href: "#field-reports" },
    { label: "الحسابات البنكية", href: "#bank-accounts" }, { label: "الأسئلة الشائعة", href: "#faq" },
  ]},
  institution: { title: "المؤسسة", links: [
    { label: "من نحن", href: "#about" }, { label: "تطوع معنا", href: "#volunteer" },
    { label: "كن شريكًا", href: "#partner" }, { label: "تواصل معنا", href: "#contact" },
  ]},
  legal: { title: "القانوني", links: [
    { label: "الخصوصية", href: "#privacy" }, { label: "الشروط والأحكام", href: "#terms" },
    { label: "سياسة التبرع", href: "#donation-policy" },
  ]},
} as const;
