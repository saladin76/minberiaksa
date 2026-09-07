import type { ReactElement } from "react";

/**
 * Social platform glyphs, ported from `Minbar/Footer.dc.html` → `Component.icon()`.
 *
 * The handoff injected these as raw path strings through
 * `dangerouslySetInnerHTML`; they are real JSX elements here so React can size
 * and colour them without an HTML parse per render.
 *
 * Platform names are Latin brand names and stay untranslated in every language.
 */
export type SocialIconName =
  | "whatsapp"
  | "facebook"
  | "instagram"
  | "youtube"
  | "x"
  | "telegram"
  | "tiktok"
  | "snapchat"
  | "linkedin";

const PATHS: Record<SocialIconName, ReactElement> = {
  whatsapp: (
    <path
      d="M12.04 2.5c-5.23 0-9.48 4.24-9.48 9.47 0 1.67.44 3.3 1.28 4.74L2.5 21.5l4.92-1.29a9.45 9.45 0 0 0 4.62 1.18h.01c5.22 0 9.47-4.24 9.47-9.47 0-2.53-.99-4.91-2.78-6.7a9.4 9.4 0 0 0-6.7-2.72Zm0 17.06h-.01a7.87 7.87 0 0 1-4.01-1.1l-.29-.17-2.92.76.78-2.85-.19-.29a7.85 7.85 0 0 1-1.2-4.19c0-4.34 3.53-7.87 7.88-7.87 2.1 0 4.08.82 5.56 2.31a7.82 7.82 0 0 1 2.3 5.57c0 4.34-3.53 7.83-7.9 7.83Zm4.32-5.87c-.24-.12-1.4-.69-1.61-.77-.22-.08-.38-.12-.54.12-.16.24-.62.77-.76.93-.14.16-.28.18-.52.06-.24-.12-1-.37-1.9-1.18-.7-.63-1.18-1.4-1.32-1.64-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.46-.39-.4-.54-.41h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.19 1.1.16 1.52.1.46-.07 1.4-.57 1.6-1.13.2-.55.2-1.03.14-1.13-.06-.1-.22-.16-.46-.28Z"
      fill="currentColor"
    />
  ),
  facebook: (
    <path
      d="M13.5 21v-7.6h2.6l.4-3h-3v-1.9c0-.87.24-1.46 1.5-1.46h1.6V4.3c-.28-.04-1.23-.12-2.34-.12-2.32 0-3.9 1.4-3.9 4V10.4H7.4v3h2.9V21h3.2Z"
      fill="currentColor"
    />
  ),
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="3.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17" cy="7" r="1.1" fill="currentColor" />
    </>
  ),
  youtube: (
    <path
      d="M21.6 7.9a2.6 2.6 0 0 0-1.8-1.8C18.2 5.7 12 5.7 12 5.7s-6.2 0-7.8.4A2.6 2.6 0 0 0 2.4 7.9C2 9.5 2 12 2 12s0 2.5.4 4.1a2.6 2.6 0 0 0 1.8 1.8c1.6.4 7.8.4 7.8.4s6.2 0 7.8-.4a2.6 2.6 0 0 0 1.8-1.8c.4-1.6.4-4.1.4-4.1s0-2.5-.4-4.1ZM10.2 15V9l5.2 3-5.2 3Z"
      fill="currentColor"
    />
  ),
  x: (
    <path d="M17.5 3h3.2l-7 8 7.3 10h-5.6l-4.4-6.2L5.7 21H2.5l7.3-8.4L2.8 3h5.7l4.1 5.8L17.5 3Z" fill="currentColor" />
  ),
  telegram: (
    <path
      d="M21.5 4.5 3 11.6c-.9.36-.9 1.66.02 1.98l4.4 1.5 1.7 5.5c.24.78 1.24.98 1.78.37l2.4-2.7 4.5 3.3c.72.53 1.76.14 1.95-.74l3-14.3c.22-1.02-.8-1.85-1.75-1.48Zm-3.35 3.2-8 7.2-.3 3.1-1.3-4.3 8.3-6.6c.2-.16.44.1.28.28Z"
      fill="currentColor"
    />
  ),
  tiktok: (
    <path
      d="M16.5 3c.4 2 1.9 3.5 4 3.8v3.1a7.3 7.3 0 0 1-4-1.2v6.5a5.9 5.9 0 1 1-5.9-5.9c.3 0 .6.02.9.06v3.2a2.8 2.8 0 1 0 2 2.68V3h3Z"
      fill="currentColor"
    />
  ),
  snapchat: (
    <path
      d="M12 3.2c2.6 0 4.2 1.9 4.2 4.4 0 1 .1 1.9.2 2.3.5.15 1.1.1 1.5-.1.4-.2.9-.1 1 .3.1.4-.1.8-.6 1-.5.2-1.1.4-1.1.7 0 .5.9 1.5 2 1.9.3.1.4.4.3.7-.2.5-1 .7-1.7.9-.2.05-.3.2-.35.4-.05.2-.1.5-.2.7-.1.25-.35.3-.6.28-.5-.05-1-.1-1.6.1-.6.2-1.1.7-2.1.7s-1.5-.5-2.1-.7c-.6-.2-1.1-.15-1.6-.1-.25.02-.5-.03-.6-.28-.1-.2-.15-.5-.2-.7-.05-.2-.15-.35-.35-.4-.7-.2-1.5-.4-1.7-.9-.1-.3 0-.6.3-.7 1.1-.4 2-1.4 2-1.9 0-.3-.6-.5-1.1-.7-.5-.2-.7-.6-.6-1 .1-.4.6-.5 1-.3.4.2 1 .25 1.5.1.1-.4.2-1.3.2-2.3 0-2.5 1.6-4.4 4.2-4.4Z"
      fill="currentColor"
    />
  ),
  linkedin: (
    <path
      d="M6.9 8.6H3.7V20h3.2V8.6ZM5.3 4a1.9 1.9 0 1 0 0 3.8 1.9 1.9 0 0 0 0-3.8ZM20.3 20v-6.4c0-3.4-1.8-5-4.2-5-1.9 0-2.8 1.06-3.3 1.8V8.6H9.6c.04.9 0 11.4 0 11.4h3.2v-6.4c0-.34.02-.68.13-.93.28-.68.9-1.4 1.96-1.4 1.38 0 1.94 1.06 1.94 2.6V20h3.2Z"
      fill="currentColor"
    />
  ),
};

/** Sizes tuned per glyph so the optical weight matches across the row. */
const SIZES: Partial<Record<SocialIconName, number>> = { instagram: 16, x: 14 };

export default function SocialIcon({ name }: { name: SocialIconName }) {
  const size = SIZES[name] ?? 16;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
