export interface VariableEntry {
  token: string;
  label: string;
  exampleValue: string;
}

export interface VariableGroup {
  group: string;
  entries: VariableEntry[];
}

export const VARIABLE_CATALOG: VariableGroup[] = [
  {
    group: "المتبرع",
    entries: [
      { token: "{{user.name}}", label: "الاسم", exampleValue: "أحمد" },
      { token: "{{user.email}}", label: "البريد", exampleValue: "ahmed@example.com" },
      { token: "{{user.phone}}", label: "الهاتف", exampleValue: "+90 555 555 5555" },
      { token: "{{user.countryName}}", label: "الدولة", exampleValue: "تركيا" },
      { token: "{{user.countryCode}}", label: "رمز الدولة", exampleValue: "TR" },
      { token: "{{user.city}}", label: "المدينة", exampleValue: "إسطنبول" },
      { token: "{{user.preferredLang}}", label: "اللغة المفضلة", exampleValue: "ar" },
    ],
  },
  {
    group: "ملخص التبرعات",
    entries: [
      { token: "{{totals.count}}", label: "عدد التبرعات", exampleValue: "5" },
      { token: "{{totals.amountUSD}}", label: "الإجمالي (USD)", exampleValue: "250" },
      { token: "{{totals.lastAt}}", label: "تاريخ آخر تبرع", exampleValue: "2026-04-12" },
    ],
  },
  {
    group: "تكرار التبرعات: {{#donations}} ... {{/donations}}",
    entries: [
      { token: "{{amountUSD}}", label: "المبلغ (USD)", exampleValue: "50" },
      { token: "{{amount}}", label: "المبلغ", exampleValue: "50" },
      { token: "{{currency}}", label: "العملة", exampleValue: "USD" },
      { token: "{{createdAt}}", label: "التاريخ", exampleValue: "2026-04-12" },
      { token: "{{campaignTitle}}", label: "عنوان الحملة", exampleValue: "حملة العيون" },
      { token: "{{itemCount}}", label: "عدد البنود", exampleValue: "2" },
    ],
  },
  {
    group: "التبرّعة الحالية (للأحداث التلقائية فقط)",
    entries: [
      { token: "{{donation.id}}", label: "معرّف التبرّعة", exampleValue: "65f12abc..." },
      { token: "{{donation.amount}}", label: "المبلغ", exampleValue: "50" },
      { token: "{{donation.amountUSD}}", label: "المبلغ (USD)", exampleValue: "50" },
      { token: "{{donation.currency}}", label: "العملة", exampleValue: "USD" },
      { token: "{{donation.totalAmount}}", label: "الإجمالي", exampleValue: "55" },
      { token: "{{donation.itemCount}}", label: "عدد البنود", exampleValue: "2" },
      { token: "{{donation.createdAt}}", label: "تاريخ التبرّعة", exampleValue: "2026-04-12" },
      { token: "{{donation.campaignTitle}}", label: "أسماء الحملات (مفصولة)", exampleValue: "حملة العيون، حملة الشتاء" },
    ],
  },
  {
    group: "تحديث المشروع (لحملات «إرسال التحديث للمتبرعين»)",
    entries: [
      { token: "{{update.title}}", label: "عنوان التحديث", exampleValue: "وصلت السلال الغذائية إلى 300 أسرة" },
      { token: "{{update.description}}", label: "نص التحديث", exampleValue: "بفضل تبرعاتكم وزّع فريقنا الميداني هذا الأسبوع 300 سلة غذائية على الأسر المحتاجة." },
      { token: "{{update.image}}", label: "صورة التحديث (رابط)", exampleValue: "https://res.cloudinary.com/demo/image/upload/sample.jpg" },
      { token: "{{update.cover}}", label: "الصورة أو لقطة الفيديو (رابط)", exampleValue: "https://res.cloudinary.com/demo/image/upload/sample.jpg" },
      { token: "{{update.videoUrl}}", label: "رابط الفيديو", exampleValue: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
      { token: "{{update.videoThumbnail}}", label: "لقطة الفيديو (رابط صورة)", exampleValue: "https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
      { token: "{{update.date}}", label: "تاريخ التحديث", exampleValue: "2026-09-29" },
      { token: "{{update.campaignTitle}}", label: "اسم المشروع", exampleValue: "سلال غذائية لغزة" },
      { token: "{{update.url}}", label: "رابط التحديثات في صفحة المشروع", exampleValue: "https://minberiaksa.vercel.app/ar/projects/gaza-food#updates" },
      { token: "{{update.donateUrl}}", label: "رابط التبرع للمشروع", exampleValue: "https://minberiaksa.vercel.app/ar/projects/gaza-food" },
    ],
  },
  {
    group: "بنود التبرّعة الحالية: {{#donation.items}} ... {{/donation.items}}",
    entries: [
      { token: "{{campaignTitle}}", label: "عنوان الحملة", exampleValue: "حملة العيون" },
      { token: "{{amount}}", label: "المبلغ", exampleValue: "25" },
      { token: "{{amountUSD}}", label: "المبلغ (USD)", exampleValue: "25" },
      { token: "{{currency}}", label: "العملة", exampleValue: "USD" },
      { token: "{{shareCount}}", label: "عدد السهوم (إن وجد)", exampleValue: "2" },
    ],
  },
];
