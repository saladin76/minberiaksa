import { FileText } from "lucide-react";

type Copy = {
  title: string;
  subtitle: string;
  lastUpdated: string;
  sections: { heading: string; body: string[] }[];
  contact: { heading: string; body: string };
};

const CONTENT: Record<string, Copy> = {
  ar: {
    title: "شروط الاستخدام",
    subtitle: "القواعد التي تحكم استخدامك لهذا الموقع والتبرعات عبره.",
    lastUpdated: "آخر تحديث: 2026-04-20",
    sections: [
      {
        heading: "١. قبول الشروط",
        body: [
          "باستخدامك لهذا الموقع أو التبرع عبره، فإنك توافق على الالتزام بهذه الشروط. إذا كنت لا توافق، يُرجى عدم استخدام الموقع.",
        ],
      },
      {
        heading: "٢. التبرعات",
        body: [
          "جميع التبرعات طوعية ونهائية باستثناء الحالات التي يوجبها القانون أو سياستنا للاسترداد.",
          "تُستخدم التبرعات لدعم الحملات المُحددة أو للصرف على أنشطة الجمعية العامة عند اختيار خيار «دعم الفريق».",
          "نحتفظ بالحق في إعادة توجيه التبرعات إلى حملات مماثلة إذا تحققت أهداف الحملة الأصلية أو انتهت مدتها.",
        ],
      },
      {
        heading: "٣. استخدام الموقع",
        body: [
          "يُحظر استخدام الموقع لأي غرض غير مشروع أو يتعارض مع هذه الشروط.",
          "يُحظر محاولة الوصول غير المصرح به أو تعطيل عمل الموقع بأي شكل.",
          "أنت مسؤول عن الحفاظ على سرية بيانات حسابك إذا قمت بإنشاء حساب.",
        ],
      },
      {
        heading: "٤. الملكية الفكرية",
        body: [
          "جميع المحتويات المنشورة على هذا الموقع (نصوص، صور، شعارات) مملوكة للجمعية ومحمية بحقوق النشر. لا يجوز إعادة استخدامها دون إذن كتابي.",
        ],
      },
      {
        heading: "٥. حدود المسؤولية",
        body: [
          "نبذل قصارى جهدنا للحفاظ على الموقع متاحاً ودقيقاً، لكننا لا نضمن خلوه من الأخطاء أو التوقف المؤقت.",
          "لا نتحمل مسؤولية أي خسارة غير مباشرة ناتجة عن استخدامك للموقع.",
        ],
      },
      {
        heading: "٦. تعديل الشروط",
        body: [
          "قد نُحدّث هذه الشروط من وقت لآخر. التاريخ أعلى الصفحة يعكس آخر تعديل.",
        ],
      },
      {
        heading: "٧. القانون المعمول به",
        body: [
          "تخضع هذه الشروط لقوانين الجمهورية التركية، وتُفصل النزاعات أمام محاكم إسطنبول المختصة.",
        ],
      },
    ],
    contact: {
      heading: "للتواصل",
      body: "لأي استفسار حول هذه الشروط، يرجى التواصل معنا عبر صفحة «اتصل بنا».",
    },
  },
  en: {
    title: "Terms of Use",
    subtitle: "The rules governing your use of this site and donations made through it.",
    lastUpdated: "Last updated: 2026-04-20",
    sections: [
      {
        heading: "1. Acceptance of terms",
        body: [
          "By using this site or donating through it, you agree to these terms. If you do not agree, please do not use the site.",
        ],
      },
      {
        heading: "2. Donations",
        body: [
          "All donations are voluntary and final except where required by law or our refund policy.",
          "Donations are used to support specific campaigns, or to fund the organization's general activities when you select \"Team Support\".",
          "We reserve the right to redirect donations to similar campaigns if the original campaign's goals are met or it has ended.",
        ],
      },
      {
        heading: "3. Site use",
        body: [
          "Use of the site for any unlawful purpose or in violation of these terms is prohibited.",
          "You may not attempt unauthorized access or disrupt the site in any way.",
          "You are responsible for keeping your account credentials confidential if you create an account.",
        ],
      },
      {
        heading: "4. Intellectual property",
        body: [
          "All content on this site (text, images, logos) is owned by the organization and protected by copyright. Reuse requires written permission.",
        ],
      },
      {
        heading: "5. Limitation of liability",
        body: [
          "We do our best to keep the site accurate and available but do not guarantee it will be error-free or uninterrupted.",
          "We are not liable for any indirect loss resulting from your use of the site.",
        ],
      },
      {
        heading: "6. Changes to terms",
        body: [
          "We may update these terms from time to time. The date at the top reflects the most recent change.",
        ],
      },
      {
        heading: "7. Governing law",
        body: [
          "These terms are governed by the laws of the Republic of Türkiye, and disputes are resolved in the competent courts of Istanbul.",
        ],
      },
    ],
    contact: {
      heading: "Contact",
      body: "For any questions about these terms, please reach us through the Contact page.",
    },
  },
};

const ALIAS: Record<string, string> = { fr: "en", tr: "en", id: "en", pt: "en", es: "en" };

export default function TermsPage({ locale }: { locale: string }) {
  const effective = CONTENT[locale] ? locale : ALIAS[locale] ?? "en";
  const copy = CONTENT[effective];
  const isRTL = locale === "ar";

  return (
    <main dir={isRTL ? "rtl" : "ltr"} className="min-h-screen bg-white">
      <section className="relative bg-[#A5243D] text-white py-14">
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:16px_16px]" />
        <div className="relative max-w-3xl mx-auto px-4 text-center">
          <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 px-3 py-1.5 rounded-full text-xs font-semibold mb-4">
            <FileText className="w-3.5 h-3.5" />
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
