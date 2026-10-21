import {
  readPublicEditorialSeo,
  publicFaq,
} from "@/lib/content-editor/public-seo";
export async function EditorialFaq({
  kind,
  contentKey,
  locale,
}: {
  kind: Parameters<typeof readPublicEditorialSeo>[0];
  contentKey: string;
  locale: string;
}) {
  const extra = await readPublicEditorialSeo(kind, contentKey, locale),
    faq = publicFaq(extra?.faqContent);
  if (!faq.length) return null;
  const schema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
  return (
    <section
      className="mx-auto my-10 max-w-5xl space-y-4 px-4"
      aria-label={locale === "ar" ? "الأسئلة الشائعة" : "FAQ"}
    >
      <h2 className="text-2xl font-bold">
        {locale === "ar" ? "الأسئلة الشائعة" : "FAQ"}
      </h2>
      {faq.map((item, index) => (
        <details key={index} className="rounded-xl border p-5">
          <summary className="cursor-pointer font-semibold">{item.q}</summary>
          <p className="mt-4 whitespace-pre-wrap leading-8">{item.a}</p>
        </details>
      ))}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(schema).replace(/</g, "\\u003c"),
        }}
      />
    </section>
  );
}
