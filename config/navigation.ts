export type NavigationItem = {
  label: string;
  href: string;
};

export const primaryNavigation: NavigationItem[] = [
  { label: "المشاريع", href: "/projects" },
  { label: "الزكاة", href: "/zakat" },
  { label: "الأوقاف", href: "/waqf" },
  { label: "العطاء المستمر", href: "/recurring" },
  { label: "الأثر والتقارير", href: "/impact" },
  { label: "من الميدان", href: "/stories" },
  { label: "المعرفة", href: "/knowledge" },
];

export const utilityNavigation: NavigationItem[] = [
  { label: "الأثر والتقارير", href: "/impact" },
  { label: "حساب المتبرع", href: "/account" },
  { label: "مركز المعرفة", href: "/knowledge" },
];

export const footerNavigation = {
  donation: {
    title: "مسارات العطاء",
    links: [
      { label: "المشاريع", href: "/projects" },
      { label: "الزكاة", href: "/zakat" },
      { label: "الأوقاف", href: "/waqf" },
      { label: "العطاء المستمر", href: "/recurring" },
    ],
  },
  trust: {
    title: "الأثر والشفافية",
    links: [
      { label: "الأثر والتقارير", href: "/impact" },
      { label: "التقارير والوثائق", href: "/impact#documents" },
      { label: "القصص الميدانية", href: "/stories" },
      { label: "مركز المعرفة", href: "/knowledge" },
    ],
  },
  account: {
    title: "حساب المتبرع",
    links: [
      { label: "نظرة عامة", href: "/account" },
      { label: "سجل التبرعات", href: "/account/donations" },
      { label: "محفظة الأثر", href: "/account/impact" },
      { label: "الوثائق", href: "/account/documents" },
    ],
  },
} as const;
