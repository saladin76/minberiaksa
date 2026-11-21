/* Shown while a public page is loading after a tap (mobile review, 2026-11-21): before this file a donor saw a
   blank white screen between pages. Inline SVG animation, so it needs no stylesheet and no JavaScript. */
export default function Loading() {
  return (
    <div role="status" aria-live="polite" style={{ minHeight: "60vh", display: "grid", placeItems: "center" }}>
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r="18" fill="none" stroke="rgba(211,154,39,.22)" strokeWidth="4" />
        <path d="M22 4a18 18 0 0 1 18 18" fill="none" stroke="#D39A27" strokeWidth="4" strokeLinecap="round">
          <animateTransform attributeName="transform" type="rotate" from="0 22 22" to="360 22 22" dur="0.8s" repeatCount="indefinite" />
        </path>
      </svg>
      <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>…</span>
    </div>
  );
}
