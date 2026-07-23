export type NavigationItem = {
  label: string;
  href: string;
  external?: boolean;
};

export type NavigationGroup = {
  title: string;
  links: NavigationItem[];
};

export const primaryNavigation: NavigationItem[] = [
  { label: "المشاريع", href: "/projects" },
  { label: "الزكاة", href: "/zakat" },
  { label: "الأوقاف", href: "/waqf" },
  { label: "العطاء المستمر", href: "/recurring" },
  { label: "الأثر والإنجازات", href: "/impact" },
  { label: "المعرفة", href: "/knowledge" },
  { label: "من نحن", href: "/about" },
];

export const utilityNavigation: NavigationItem[] = [
  { label: "كن شريكًا", href: "mailto:info@minberiaksa.org?subject=طلب شراكة مع مؤسسة منبر الأقصى" },
  { label: "تطوع معنا", href: "mailto:info@minberiaksa.org?subject=طلب تطوع مع مؤسسة منبر الأقصى" },
  { label: "استكشف مشاريع الشركاء", href: "/projects" },
];

export const mobileNavigationGroups: NavigationGroup[] = [
  {
    title: "العطاء",
    links: primaryNavigation.slice(0, 4),
  },
  {
    title: "الثقة والمعرفة",
    links: [
      { label: "الأثر والإنجازات", href: "/impact" },
      { label: "التقارير", href: "/impact#documents" },
      { label: "المعرفة", href: "/knowledge" },
      { label: "الأسئلة الشائعة", href: "/knowledge#faq" },
    ],
  },
  {
    title: "المؤسسة",
    links: [
      { label: "من نحن", href: "/about" },
      { label: "تطوع معنا", href: "mailto:info@minberiaksa.org?subject=طلب تطوع مع مؤسسة منبر الأقصى" },
      { label: "كن شريكًا", href: "mailto:info@minberiaksa.org?subject=طلب شراكة مع مؤسسة منبر الأقصى" },
      { label: "مشاريع الشركاء", href: "/projects" },
      { label: "تواصل معنا", href: "/#contact" },
    ],
  },
];

export const footerNavigation = [
  {
    title: "التبرع",
    links: [
      { label: "المشاريع", href: "/projects" },
      { label: "الزكاة", href: "/zakat" },
      { label: "الأوقاف", href: "/waqf" },
      { label: "العطاء المستمر", href: "/recurring" },
    ],
  },
  {
    title: "الثقة",
    links: [
      { label: "الإنجازات", href: "/impact" },
      { label: "التقارير الميدانية", href: "/impact#documents" },
      { label: "الحسابات البنكية", href: "https://minberiaksa.org/hesapnumaralarimiz", external: true },
      { label: "الأسئلة الشائعة", href: "/knowledge" },
    ],
  },
  {
    title: "المؤسسة",
    links: [
      { label: "من نحن", href: "/about" },
      { label: "تطوع معنا", href: "mailto:info@minberiaksa.org?subject=طلب تطوع مع مؤسسة منبر الأقصى" },
      { label: "كن شريكًا", href: "mailto:info@minberiaksa.org?subject=طلب شراكة مع مؤسسة منبر الأقصى" },
      { label: "تواصل معنا", href: "#contact" },
    ],
  },
  {
    title: "القانوني",
    links: [
      { label: "الخصوصية", href: "https://minberiaksa.org/cerez-politikasi", external: true },
      { label: "الشروط والأحكام", href: "https://minberiaksa.org/cerez-politikasi", external: true },
      { label: "سياسة التبرع", href: "https://minberiaksa.org/cerez-politikasi", external: true },
    ],
  },
] as const;
