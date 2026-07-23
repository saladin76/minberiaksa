"use client";

import { useMemo, useState } from "react";
import type { KnowledgeArticle, KnowledgeTopic } from "@/types/knowledge";
import { knowledgeTopics } from "@/data/knowledge";
import { ArticleCard } from "./article-card";

export function KnowledgeExplorer({ articles }: { articles: KnowledgeArticle[] }) {
  const [query, setQuery] = useState("");
  const [topic, setTopic] = useState<"all" | KnowledgeTopic>("all");
  const results = useMemo(
    () => articles.filter((article) =>
      (topic === "all" || article.topic === topic)
      && `${article.title} ${article.summary} ${article.topic} ${article.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase())),
    [articles, query, topic],
  );
  const clear = () => {
    setQuery("");
    setTopic("all");
  };

  return (
    <section id="knowledge-explorer" className="knowledge-section knowledge-explorer">
      <div className="site-container">
        <div className="knowledge-search">
          <label htmlFor="knowledge-search">ابحث في المقالات</label>
          <div>
            <input
              id="knowledge-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="الزكاة، الوقف، التقارير…"
            />
            <button type="button" onClick={clear}>مسح</button>
          </div>
          <p aria-live="polite">{results.length.toLocaleString("ar")} نتيجة</p>
        </div>

        <nav className="topic-navigation" aria-label="موضوعات المعرفة">
          <button type="button" aria-pressed={topic === "all"} onClick={() => setTopic("all")}>جميع الموضوعات</button>
          {knowledgeTopics.map((item) => (
            <button key={item.id} type="button" aria-pressed={topic === item.id} onClick={() => setTopic(item.id)}>{item.label}</button>
          ))}
        </nav>

        {results.length ? (
          <div className="article-list">{results.map((article) => <ArticleCard key={article.slug} article={article} />)}</div>
        ) : (
          <div className="knowledge-empty">
            <h2>لا توجد نتائج</h2>
            <p>جرّب كلمة أخرى أو امسح الفلاتر.</p>
            <div>
              <button className="button button-primary" type="button" onClick={clear}>مسح الفلاتر</button>
              <a className="text-link" href="/">العودة إلى الرئيسية</a>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
