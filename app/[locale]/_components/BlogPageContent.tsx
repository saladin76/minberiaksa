"use client";

import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link } from "@/i18n/routing";
import { Search, BookOpen, Calendar, ArrowRight, Loader2 } from "lucide-react";
import { useDebounce } from "use-debounce";
import { useLocale, useTranslations } from "next-intl";
import { formatDistanceToNow, type Locale } from "date-fns";
import { ar, enUS, tr } from "date-fns/locale";

interface Post {
  id: string;
  slug?: string | null;
  title: string;
  description: string;
  image?: string | null;
  createdAt: string | Date;
  category?: { id?: string; slug?: string | null; name?: string } | null;
}

const dateLocaleMap: Record<string, Locale> = { ar, en: enUS, tr };

interface BlogPageContentProps {
  initialPosts?: Post[];
  initialCursor?: string | null;
  initialHasMore?: boolean;
}

const BlogPage = ({
  initialPosts = [],
  initialCursor = null,
  initialHasMore = false,
}: BlogPageContentProps = {}) => {
  const t = useTranslations("Blog");
  const locale = useLocale();
  const dateLocale = dateLocaleMap[locale] ?? enUS;

  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [loading, setLoading] = useState(initialPosts.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch] = useDebounce(searchQuery, 400);
  const didHydrateRef = useRef(false);
  const ITEMS_PER_PAGE = 9;

  const fetchPosts = async (cursorParam?: string | null) => {
    try {
      setIsLoadingMore(true);
      const res = await axios.get("/api/posts", {
        params: { locale, limit: ITEMS_PER_PAGE, cursor: cursorParam, search: debouncedSearch },
      });
      const items: Post[] = res.data?.items ?? res.data ?? [];
      if (cursorParam) setPosts((prev) => [...prev, ...items]);
      else setPosts(items);
      setHasMore(Boolean(res.data?.hasMore));
      setCursor(res.data?.nextCursor ?? null);
    } catch {
      /* ignore */
    } finally {
      setIsLoadingMore(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Skip first run: initial data was provided by the server render.
    if (!didHydrateRef.current) {
      didHydrateRef.current = true;
      if (initialPosts.length === 0) {
        setLoading(true);
        setCursor(null);
        setPosts([]);
        fetchPosts();
      }
      return;
    }
    setLoading(true);
    setCursor(null);
    setPosts([]);
    fetchPosts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale, debouncedSearch]);

  const formatDate = (date: string | Date) => {
    try {
      return formatDistanceToNow(new Date(date), { addSuffix: true, locale: dateLocale });
    } catch { return ""; }
  };

  return (
    <main className="min-h-screen bg-white">
      {/* ── Header ── */}
      <section
        className="relative hero-pattern text-white py-14 sm:py-20 overflow-hidden"
        style={{ backgroundImage: "url('/hero2.jpg')", backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="absolute inset-0 bg-deep/85" />
        <div className="relative max-w-7xl mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-2 mb-4">
            <BookOpen className="w-6 h-6 text-gold" />
            <span className="text-sm font-bold uppercase tracking-widest text-ice">{t("news") || "HABERLER"}</span>
          </div>
          <div className="gold-mark mx-auto mb-5" />
          <h1 className="text-3xl sm:text-4xl font-extrabold mb-2">{t("title") || "Haberler"}</h1>
          <p className="text-ice text-sm max-w-xl mx-auto mb-6">{t("subtitle") || ""}</p>

          {/* Search */}
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder") || "Haber ara..."}
              className="w-full pl-10 pr-4 py-2.5 shape-chip text-sm text-ink bg-white outline-none shadow-soft"
            />
          </div>
        </div>
      </section>

      {/* ── Posts Grid ── */}
      <section className="max-w-7xl mx-auto px-4 py-10 sm:py-14">
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-xl overflow-hidden shadow-sm border border-gray-100 bg-white">
                <div className="h-48 bg-gray-200 animate-pulse" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse" />
                  <div className="h-3 bg-gray-100 rounded animate-pulse w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-gray-700 mb-2">{t("noPosts") || "Henüz haber yok"}</h3>
            <p className="text-gray-500 text-sm">{t("checkBackLater") || "Daha sonra tekrar kontrol edin"}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post) => (
              <Link
                key={post.id}
                href={`/blog/${post.slug || post.id}`}
                className="group block bg-white shape-card overflow-hidden shadow-soft hover:shadow-lift transition-all duration-300"
              >
                {/* Image */}
                <div className="relative overflow-hidden h-48">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={post.image || "https://i.ibb.co/N2zVsqfg/calisma-alanlarimiz-egitim-sektoru.jpg"}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    loading="lazy"
                  />
                  <div className="image-overlay absolute inset-x-0 bottom-0 h-1/2" />
                  {post.category?.name && (
                    <div className="absolute top-3 left-3">
                      <span className="shape-chip bg-burgundy text-white text-xs font-semibold px-2.5 py-1">
                        {post.category.name}
                      </span>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="p-5">
                  <div className="gold-mark-sm mb-3" />
                  <h3 className="font-bold text-deep text-base mb-2 line-clamp-2 group-hover:text-burgundy transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-gray-500 text-xs line-clamp-2 mb-3">{post.description}</p>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      {formatDate(post.createdAt)}
                    </span>
                    <span className="flex items-center gap-1 text-burgundy font-semibold group-hover:text-burgundyDark transition-colors">
                      {t("readMore") || "Devamını Oku"} <ArrowRight className="w-3.5 h-3.5 rtl:rotate-180" />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Load more */}
        {hasMore && !loading && (
          <div className="text-center mt-10">
            <button
              onClick={() => fetchPosts(cursor)}
              disabled={isLoadingMore}
              className="shape-button inline-flex items-center gap-2 bg-burgundy hover:bg-burgundyDark text-white font-semibold px-8 py-3 transition-colors disabled:opacity-60"
            >
              {isLoadingMore ? <><Loader2 className="w-4 h-4 animate-spin" /> {t("loading") || "Yükleniyor..."}</> : <>{t("loadMore") || "Daha Fazla"} <ArrowRight className="w-4 h-4 rtl:rotate-180" /></>}
            </button>
          </div>
        )}
      </section>
    </main>
  );
};

export default BlogPage;
