import type { KnowledgeArticle } from "@/types/knowledge";

export function KnowledgeHero({ article }: { article: KnowledgeArticle }) {
  return (
    <section className="knowledge-hero">
      <div className="site-container knowledge-hero-grid">
        <div>
          <span className="eyebrow">مركز المعرفة</span>
          <h1>اعرف قبل أن تعطي</h1>
          <p>أدلة واضحة تساعدك على فهم رحلة التبرع واختيار المسار المناسب ومتابعة التحديثات والوثائق.</p>
          <a className="button button-primary" href="#knowledge-explorer">ابدأ بالدليل المناسب</a>
        </div>
        <article className="featured-guide">
          <span>دليل مختار</span>
          <h2>{article.title}</h2>
          <p>{article.summary}</p>
          <ul>
            <li>شرح مباشر دون مصطلحات معقدة</li>
            <li>تنبيهات واضحة عند الحاجة إلى مراجعة مختصة</li>
            <li>روابط إلى المسار المناسب داخل الموقع</li>
          </ul>
          <a href={`/knowledge/${article.slug}`}>اقرأ الدليل</a>
        </article>
      </div>
    </section>
  );
}