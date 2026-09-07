import { Shield } from "lucide-react";

type Copy = {
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: { heading: string; body: string[] }[];
  contact: { heading: string; body: string };
};

const CONTENT: Record<string, Copy> = {
  ar: {
    title: "سياسة الخصوصية",
    subtitle: "كيف نجمع بياناتك ونستخدمها ونحميها.",
    lastUpdated: "آخر تحديث: 2026-04-20",
    sections: [
      {
        heading: "١. البيانات التي نجمعها",
        body: [
          "نجمع البيانات التي تقدمها طوعاً عند التبرع أو التسجيل، بما في ذلك الاسم والبريد الإلكتروني ورقم الهاتف وبلد الإقامة.",
          "نجمع أيضاً بيانات تقنية محدودة (عنوان IP، نوع المتصفح، صفحات الزيارة) لتحسين الموقع ومنع الاحتيال.",
          "لا نخزن أرقام البطاقات الائتمانية الكاملة على خوادمنا. تتم معالجة المدفوعات عبر مزودين معتمدين (Stripe / PayFor).",
        ],
      },
      {
        heading: "٢. كيف نستخدم بياناتك",
        body: [
          "لمعالجة التبرعات وإرسال الإيصالات.",
          "للتواصل بشأن الحملات التي تدعمها، والإبلاغ عن نتائج تبرعك.",
          "لتحسين الموقع ومنع إساءة الاستخدام.",
          "لا نبيع بياناتك لأي طرف ثالث.",
        ],
      },
      {
        heading: "٣. مشاركة البيانات",
        body: [
          "نشارك البيانات فقط مع مزودي الخدمة الضروريين: بوابات الدفع، مزودي البريد الإلكتروني، مزودي الاستضافة.",
          "قد نفصح عن البيانات إذا طلبت السلطات المختصة ذلك بموجب القانون المعمول به.",
        ],
      },
      {
        heading: "٤. حقوقك",
        body: [
          "يمكنك طلب الاطلاع على بياناتك أو تصحيحها أو حذفها في أي وقت بمراسلتنا.",
          "يمكنك إلغاء الاشتراك في النشرة البريدية من أي بريد إلكتروني نرسله.",
        ],
      },
      {
        heading: "٥. ملفات تعريف الارتباط (Cookies)",
        body: [
          "نستخدم ملفات تعريف الارتباط الضرورية لعمل الموقع، وأخرى تحليلية لفهم سلوك الزوار. يمكنك التحكم بها عبر إعدادات المتصفح.",
        ],
      },
      {
        heading: "٦. تعديلات السياسة",
        body: [
          "قد نُحدّث هذه السياسة من وقت لآخر. يُنشر التاريخ في أعلى الصفحة. استمرار استخدامك للموقع بعد التحديث يُعد قبولاً للشروط الجديدة.",
        ],
      },
    ],
    contact: {
      heading: "للتواصل",
      body: "للاستفسار عن أي نقطة في هذه السياسة، يرجى التواصل عبر صفحة «اتصل بنا».",
    },
  },
  en: {
    title: "Privacy Policy",
    subtitle: "How we collect, use, and protect your data.",
    lastUpdated: "Last updated: 2026-04-20",
    sections: [
      {
        heading: "1. Data we collect",
        body: [
          "We collect data you voluntarily provide when donating or signing up, including name, email, phone number, and country.",
          "We also collect limited technical data (IP address, browser type, pages visited) to improve the site and prevent fraud.",
          "We do not store full card numbers on our servers. Payments are processed through certified providers (Stripe / PayFor).",
        ],
      },
      {
        heading: "2. How we use your data",
        body: [
          "To process donations and send receipts.",
          "To communicate about the campaigns you support and report on impact.",
          "To improve the site and prevent misuse.",
          "We do not sell your data to third parties.",
        ],
      },
      {
        heading: "3. Data sharing",
        body: [
          "We share data only with essential service providers: payment gateways, email providers, and hosting providers.",
          "We may disclose data if required by law.",
        ],
      },
      {
        heading: "4. Your rights",
        body: [
          "You may request access, correction, or deletion of your data at any time by contacting us.",
          "You may unsubscribe from any email we send.",
        ],
      },
      {
        heading: "5. Cookies",
        body: [
          "We use essential cookies for site functionality and analytics cookies to understand visitor behavior. You can control these through your browser settings.",
        ],
      },
      {
        heading: "6. Policy changes",
        body: [
          "We may update this policy from time to time. The date at the top reflects the most recent change. Continued use of the site constitutes acceptance.",
        ],
      },
    ],
    contact: {
      heading: "Contact",
      body: "For any questions about this policy, please reach us through the Contact page.",
    },
  },
};

const ALIAS: Record<string, string> = { fr: "en", tr: "en", id: "en", pt: "en", es: "en" };

export default function PolicyPage({ locale }: { locale: string }) {
  const effective = CONTENT[locale] ? locale : ALIAS[locale] ?? "en";
  const copy = CONTENT[effective];
  const isRTL = locale === "ar";

  return (
    <main dir={isRTL ? "rtl" : "ltr"} className="min-h-screen bg-white">
      <section className="relative bg-[#A5243D] text-white py-14">
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 px-3 py-1.5 rounded-full text-xs font-semibold mb-4">
            <Shield className="w-3.5 h-3.5" />
            <span>{copy.title}</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-2">{copy.title}</h1>
          <p className="text-white/80 text-sm">{copy.subtitle}</p>
          <p className="text-white/60 text-xs mt-3">{copy.lastUpdated}</p>
        </div>
      </section>

      <article className="max-w-3xl mx-auto px-4 py-12 space-y-8">
        {copy.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-lg font-bold text-gray-900 mb-3">{s.heading}</h2>
            <div className="space-y-2">
              {s.body.map((p, i) => (
                <p key={i} className="text-sm text-gray-600 leading-relaxed">
                  {p}
                </p>
              ))}
            </div>
          </section>
        ))}

        <section className="bg-gray-50 rounded-xl border border-gray-100 p-5">
          <h2 className="text-base font-bold text-gray-900 mb-2">{copy.contact.heading}</h2>
          <p className="text-sm text-gray-600 leading-relaxed">{copy.contact.body}</p>
        </section>
      </article>
    </main>
  );
}
