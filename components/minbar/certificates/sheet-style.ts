import type { CSSProperties } from "react";

// One opaque, light tile avoids Chromium PDF's compositing of overlapping
// translucent gradients. The preview and every generated document share it.
const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><rect width="48" height="48" fill="#fffdfa"/><path d="M24 0 48 24 24 48 0 24Z M0 0 48 48 M48 0 0 48" fill="none" stroke="#f4ecdD" stroke-width=".6"/><circle cx="24" cy="24" r="23" fill="none" stroke="#f7f1e7" stroke-width=".6"/></svg>`;
export const CERTIFICATE_GROUND: CSSProperties = {
  position: "absolute", inset: 0, pointerEvents: "none",
  backgroundColor: "#fffdfa",
  backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(tile)}")`,
  backgroundSize: "48px 48px",
};
