import Link from "next/link";
import type { KnowledgeArticle } from "@/types/knowledge";

export function ArticleCard({ article }: { article: KnowledgeArticle }) {
  return (
    <article className="article-card">
      <span>دليل إرشادي · {article.readingMinutes} دقائق قراءة</span>
      <h3><Link href={`/knowledge/${article.slug}`}>{article.title}</Link></h3>
      <p>{article.summary}</p>
      <ul>{article.tags.map((tag) => <li key={tag}>{tag}</li>)}</ul>
    </article>
  );
}