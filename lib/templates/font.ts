/**
 * Font stack matching the public web app (next/font Poppins + Noto Kufi Arabic).
 * This is what email recipients should see by default.
 */
export const APP_FONT_STACK =
  '"Poppins", "Noto Kufi Arabic", -apple-system, BlinkMacSystemFont, "Segoe UI", Tahoma, Geneva, Verdana, sans-serif';

/**
 * What @usewaypoint/email-builder renders for the default `MODERN_SANS` enum.
 * We string-swap this for APP_FONT_STACK so blocks using the editor's default
 * font carry the same look as the rest of the app. Admin-chosen fonts (BOOK_SANS,
 * MODERN_SERIF, etc.) are untouched.
 */
export const MODERN_SANS_STACK =
  '"Helvetica Neue", "Arial Nova", "Nimbus Sans", Arial, sans-serif';

/** Stylesheet URL used by emails AND the editor preview. */
export const APP_FONT_GOOGLE_LINK =
  "https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&family=Noto+Kufi+Arabic:wght@400;500;700&display=swap";
