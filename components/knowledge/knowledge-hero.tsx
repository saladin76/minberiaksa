import type { KnowledgeArticle } from "@/types/knowledge";

export function KnowledgeHero({ article }: { article: KnowledgeArticle }) {
  return (
    <section className="knowledge-hero">
      <div className="site-container knowledge-hero-grid">
        <div>
          <span className="eyebrow">المعرفة</span>
          <h1>إجابات واضحة قبل التبرع</h1>
          <p>اقرأ عن الزكاة والوقف والتبرع الدوري وتقارير المشاريع.</p>
          <a className="button button-primary" href="#knowledge-explorer">عرض المقالات</a>
        </div>
        <article className="featured-guide">
          <span>مقال مختار</span>
          <h2>{article.title}</h2>
          <p>{article.summary}</p>
          <ul>
            <li>شرح مباشر وسهل.</li>
            <li>تنبيه عند الحاجة إلى مراجعة شرعية.</li>
            <li>روابط إلى الصفحات ذات الصلة.</li>
          </ul>
          <a href={`/knowledge/${article.slug}`}>اقرأ المقال</a>
        </article>
      </div>
    </section>
  );
}
