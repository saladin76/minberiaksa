"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { miaPath } from "@/lib/minbar/routes";
import { localeDirection } from "@/lib/locales";
import type { MinbarArticleDetail } from "@/lib/minbar/posts";
import ArticleCta from "./ArticleCta";
import ZakatBanner from "@/components/minbar/banners/ZakatBanner";
import TravelBanner from "@/components/minbar/banners/TravelBanner";
import IbadanBanner from "@/components/minbar/banners/IbadanBanner";

/**
 * An article — ported from `Minbar/تفاصيل المقال.dc.html`.
 *
 * CMS content may arrive as:
 * - clean HTML (<h2>, <p>, lists)
 * - Markdown (## headings + paragraphs)
 * - legacy plain text
 *
 * We normalize all three into the same safe React blocks. We intentionally do
 * not use dangerouslySetInnerHTML; seeded editorial HTML is parsed into text
 * blocks first, so presentation remains consistent and scriptable markup is
 * never injected into the page.
 */

export interface ArticleDetailProps {
  article: MinbarArticleDetail;
  /** Which of the eleven closing calls this article's category selects. */
  ctaKey: string;
}

interface Block {
  kind: "h2" | "p" | "li";
  text: string;
}

const HEADING_MAX_LENGTH = 80;

function decodeHtml(value: string): string {
  if (typeof document === "undefined") {
    return value
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  const el = document.createElement("textarea");
  el.innerHTML = value;
  return el.value;
}

function stripTags(value: string): string {
  return decodeHtml(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function htmlToBlocks(content: string): Block[] {
  const blocks: Block[] = [];
  const blockPattern = /<(h[1-3]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;

  for (const match of content.matchAll(blockPattern)) {
    const tag = match[1].toLowerCase();
    const text = stripTags(match[2]);
    if (!text) continue;

    blocks.push({
      kind: tag.startsWith("h") ? "h2" : tag === "li" ? "li" : "p",
      text,
    });
  }

  // If the HTML did not contain known semantic blocks, keep readable text
  // rather than rendering an empty article.
  if (!blocks.length) {
    const fallback = stripTags(content);
    if (fallback) blocks.push({ kind: "p", text: fallback });
  }

  return blocks;
}

function textToBlocks(content: string): Block[] {
  return content
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map<Block>((chunk) => {
      const heading = chunk.match(/^#{1,3}\s+(.*)$/);
      if (heading) return { kind: "h2", text: heading[1].trim() };

      const bullet = chunk.match(/^[-*]\s+(.*)$/s);
      if (bullet) return { kind: "li", text: bullet[1].trim() };

      const isSingleLine = !chunk.includes("\n");
      const looksLikeHeading =
        isSingleLine &&
        chunk.length <= HEADING_MAX_LENGTH &&
        !/[.!?،؟:]$/.test(chunk);

      return { kind: looksLikeHeading ? "h2" : "p", text: chunk };
    });
}

function toBlocks(content: string): Block[] {
  if (!content.trim()) return [];

  const looksLikeHtml = /<(?:h[1-3]|p|ul|ol|li)\b/i.test(content);
  return looksLikeHtml ? htmlToBlocks(content) : textToBlocks(content);
}

export default function ArticleDetail({ article, ctaKey }: ArticleDetailProps) {
  const locale = useLocale();
  const dir = localeDirection(locale);
  const t = useTranslations("blog");

  const blocks = useMemo(() => toBlocks(article.content), [article.content]);
  const body: Block[] = blocks.length
    ? blocks
    : article.excerpt
      ? [{ kind: "p", text: article.excerpt }]
      : [];

  const author = t("byTeam");
  const authorInitial = author.trim().charAt(0);
  const backArrow = dir === "rtl" ? "→" : "←";

  const share = () => {
    const url = typeof window === "undefined" ? "" : window.location.href;
    if (!url) return;

    if (navigator.share) {
      navigator.share({ title: article.title, url }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(url).catch(() => {});
    }
  };

  return (
    <div className="art-page">
      <section style={{ padding: "44px 0 30px" }}>
        <div style={{ maxWidth: 780, margin: "0 auto", padding: "0 24px" }}>
          <Link
            href={miaPath("blog", locale)}
            style={{ fontSize: 14, fontWeight: 800, color: "var(--muted)" }}
          >
            {backArrow} {t("backToBlog")}
          </Link>
        </div>
      </section>

      <section style={{ padding: "0 0 50px" }}>
        <article
          style={{
            maxWidth: 780,
            margin: "0 auto",
            padding: "0 24px",
            display: "grid",
            gap: 18,
          }}
        >
          <h1
            className="art-in"
            style={{
              margin: 0,
              fontSize: "clamp(26px,3vw,36px)",
              lineHeight: 1.35,
              fontWeight: 900,
            }}
          >
            {article.title}
          </h1>

          <div
            className="art-in art-in-1"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              paddingBottom: 4,
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 38,
                height: 38,
                borderRadius: "50%",
                background: "var(--sand)",
                display: "grid",
                placeItems: "center",
                fontSize: 13,
                fontWeight: 900,
                color: "var(--deep)",
                flex: "0 0 auto",
              }}
            >
              {authorInitial}
            </span>

            <div
              style={{
                display: "grid",
                gap: 1,
                lineHeight: 1.5,
                minWidth: 0,
              }}
            >
              <b style={{ fontSize: 13.5, fontWeight: 800 }}>{author}</b>
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                marginInlineStart: "auto",
              }}
            >
              <button
                type="button"
                onClick={share}
                aria-label={t("shareArticle")}
                title={t("shareArticle")}
                className="art-share"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  border: "1px solid var(--border)",
                  background: "#fff",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  color: "var(--deep)",
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="15"
                  height="15"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" />
                </svg>
              </button>
            </div>
          </div>

          {article.cover ? (
            <span
              className="art-in art-in-2"
              style={{
                position: "relative",
                display: "block",
                aspectRatio: "16/9",
                background: "var(--sand)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- covers are arbitrary CMS URLs, not a known-host set */}
              <img
                src={article.cover}
                alt=""
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
              />
            </span>
          ) : null}

          <div
            className="art-in art-in-3"
            style={{
              display: "grid",
              gap: 18,
              fontSize: 16,
              lineHeight: 1.95,
              color: "var(--deep)",
              marginTop: 8,
            }}
          >
            {body.map((block, index) => {
              if (block.kind === "h2") {
                return (
                  <h2
                    key={index}
                    style={{
                      margin: "10px 0 0",
                      fontSize: 20,
                      fontWeight: 900,
                    }}
                  >
                    {block.text}
                  </h2>
                );
              }

              if (block.kind === "li") {
                return (
                  <p
                    key={index}
                    style={{
                      margin: 0,
                      paddingInlineStart: 16,
                      position: "relative",
                    }}
                  >
                    <span aria-hidden="true">• </span>
                    {block.text}
                  </p>
                );
              }

              return (
                <p key={index} style={{ margin: 0, whiteSpace: "pre-line" }}>
                  {block.text}
                </p>
              );
            })}
          </div>

          {article.category ? (
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 8,
                paddingTop: 6,
              }}
            >
              <span
                style={{
                  display: "inline-flex",
                  padding: "6px 13px",
                  borderRadius: 999,
                  background: "var(--sand)",
                  fontSize: 12.5,
                  fontWeight: 800,
                  color: "var(--muted)",
                }}
              >
                {article.category.name}
              </span>
            </div>
          ) : null}
        </article>
      </section>

      <ArticleCta ctaKey={ctaKey} />

      <ZakatBanner />
      <TravelBanner />
      <IbadanBanner />
    </div>
  );
}
