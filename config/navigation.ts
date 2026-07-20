export type NavigationItem = { label: string; href: string };

export const primaryNavigation: NavigationItem[] = [
  { label: "المشاريع", href: "/projects" },
  { label: "الزكاة", href: "/zakat" },
  { label: "الأوقاف", href: "/waqf" },
  { label: "التبرع المستمر", href: "/#recurring" },
  { label: "الإنجازات", href: "/#impact" },
  { label: "المعرفة", href: "/#knowledge" },
  { label: "من نحن", href: "/#about" },
];

export const utilityNavigation: NavigationItem[] = [
  { label: "كن شريكًا", href: "/#about" },
  { label: "تطوع معنا", href: "/#about" },
  { label: "استكشف مشاريع الشركاء", href: "/partner-projects" },
];

export const footerNavigation = {
  donation: { title: "التبرع", links: [
    { label: "المشاريع", href: "/projects" }, { label: "الزكاة", href: "/zakat" },
    { label: "الأوقاف", href: "/waqf" }, { label: "التبرع المستمر", href: "/#recurring" },
  ]},
  trust: { title: "الثقة", links: [
    { label: "الإنجازات", href: "/#impact" }, { label: "التقارير الميدانية", href: "/#impact" },
    { label: "الحسابات البنكية", href: "/#contact" }, { label: "الأسئلة الشائعة", href: "/#knowledge" },
  ]},
  institution: { title: "المؤسسة", links: [
    { label: "من نحن", href: "/#about" }, { label: "تطوع معنا", href: "/#about" },
    { label: "كن شريكًا", href: "/#about" }, { label: "تواصل معنا", href: "/#contact" },
  ]},
  legal: { title: "القانوني", links: [
    { label: "الخصوصية", href: "/#contact" }, { label: "الشروط والأحكام", href: "/#contact" },
    { label: "سياسة التبرع", href: "/#contact" },
  ]},
} as const;
