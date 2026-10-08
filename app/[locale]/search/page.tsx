import type { Metadata } from "next";
import Link from "next/link";
import { SUPPORTED_LOCALES, localeDirection } from "@/lib/locales";
import { searchPublicContent } from "@/lib/minbar/public-search";

export const metadata: Metadata = { robots: { index: false, follow: true } };
export default async function SearchPage({ params, searchParams }: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ locale }, queryParams] = await Promise.all([params, searchParams]);
  const safeLocale = SUPPORTED_LOCALES.includes(locale as (typeof SUPPORTED_LOCALES)[number]) ? locale : "ar";
  const q = (queryParams.q ?? "").trim().slice(0, 90);
  const ar = safeLocale === "ar";
  const results = q.length >= 2 ? await searchPublicContent(safeLocale, q, 48) : [];
  const labels = ar
    ? { title: "البحث في الموقع", placeholder: "ابحث عن مشروع أو مقال أو خبر", go: "بحث", empty: "لا توجد نتائج مطابقة. جرّب كلمات أخرى.", hint: "اكتب كلمتين أو أكثر للبحث", project: "مشروع", article: "مقال", news: "خبر" }
    : { title: "Search the website", placeholder: "Search projects, articles and news", go: "Search", empty: "No matching results. Try different keywords.", hint: "Enter at least two characters", project: "Project", article: "Article", news: "News" };
  return (
    <main className="mia-site-search-page" dir={localeDirection(safeLocale)}>
      <div className="mia-site-search-page__inner">
        <h1>{labels.title}</h1>
        <form action={`/${safeLocale}/search`} method="get" className="mia-site-search-page__form" role="search">
          <input name="q" defaultValue={q} placeholder={labels.placeholder} aria-label={labels.placeholder} minLength={2} maxLength={90} required />
          <button type="submit">{labels.go}</button>
        </form>
        {q.length < 2 ? <p>{labels.hint}</p> : results.length === 0 ? <p>{labels.empty}</p> : (
          <div className="mia-site-search-page__grid">
            {results.map(item => <Link key={item.id} href={item.href} className="mia-site-search-page__result">
              <span className="mia-site-search-page__image">
                {item.image ? <span style={{ backgroundImage: `url("${item.image.replace(/"/g, "%22")}")` }} /> : <span className="mia-site-search-page__image--empty" />}
              </span>
              <span className="mia-site-search-page__copy">
                <small>{labels[item.type]}</small>
                <b>{item.title}</b>
                <span>{item.summary.slice(0, 170)}</span>
              </span>
            </Link>)}
          </div>
        )}
      </div>
    </main>
  );
}
