import Link from "next/link";
import type { KnowledgeArticle } from "@/types/knowledge";
import type { ProjectRecord } from "@/data/projects";
import { TableOfContents } from "./table-of-contents";

const topicLabel = {
  zakat: "الزكاة",
  waqf: "الوقف",
  recurring: "العطاء المستمر",
  "al-quds": "القدس والأقصى",
  gaza: "غزة والإغاثة",
  transparency: "الشفافية والتقارير",
  "donation-journey": "رحلة التبرع",
} as const;

function cta(article: KnowledgeArticle) {
  if (article.topic === "zakat") return [{ href: "/zakat#zakat-calculator", label: "انتقل إلى حاسبة الزكاة" }];
  if (article.topic === "waqf") return [{ href: "/waqf#waqf-builder", label: "استكشف مسار الوقف" }];
  if (article.topic === "recurring") return [{ href: "/recurring#recurring-plan-builder", label: "أنشئ خطة عطاء" }];
  if (article.topic === "transparency") return [{ href: "/impact", label: "الأثر والتقارير" }];
  return [{ href: "/projects", label: "استكشف المشاريع" }];
}

export function ArticleLayout({ article, project, related }: { article: KnowledgeArticle; project?: ProjectRecord; related: KnowledgeArticle[] }) {
  return (
    <article className="knowledge-article">
      <header className="article-header">
        <div className="site-container">
          <nav className="breadcrumb" aria-label="مسار الصفحة">
            <a href="/">الرئيسية</a><span aria-hidden="true">/</span><a href="/knowledge">مركز المعرفة</a><span aria-hidden="true">/</span><span aria-current="page">{article.title}</span>
          </nav>
          <span className="article-topic">{topicLabel[article.topic]}</span>
          <h1>{article.title}</h1>
          <p>{article.summary}</p>
          <div className="article-byline">
            <span>محتوى إرشادي عام</span>
            <span>{article.readingMinutes} دقائق قراءة</span>
          </div>
        </div>
      </header>

      <div className="site-container article-body-layout">
        <aside><TableOfContents sections={article.sections} /></aside>
        <div className="article-content">
          {article.sections.map((section) => (
            <section key={section.id} id={section.id}>
              <h2>{section.heading}</h2>
              {section.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
              {section.note ? <aside className="article-note"><strong>تنبيه</strong><p>{section.note}</p></aside> : null}
            </section>
          ))}

          {article.sources.length ? (
            <section>
              <h2>مراجع هذا الدليل</h2>
              <ul>{article.sources.map((source) => <li key={source}>{source}</li>)}</ul>
            </section>
          ) : null}

          {project ? (
            <p className="project-reference">مسار مرتبط: <Link href={`/projects/${project.slug}`}>{project.title.ar}</Link></p>
          ) : null}

          <div className="contextual-cta">
            {cta(article).map((item) => <a key={item.href} className="button button-primary" href={item.href}>{item.label}</a>)}
          </div>
        </div>
      </div>

      {related.length ? (
        <section className="related-articles">
          <div className="site-container">
            <h2>أدلة مرتبطة</h2>
            <div>{related.map((item) => <article key={item.slug}><h3><Link href={`/knowledge/${item.slug}`}>{item.title}</Link></h3><p>{item.summary}</p></article>)}</div>
          </div>
        </section>
      ) : null}
    </article>
  );
}