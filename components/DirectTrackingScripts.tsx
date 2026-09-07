"use client";

/**
 * Legacy pixel bootstrap kept mounted for backward compatibility with the layout.
 *
 * The canonical browser pixel owner is now `TrackingPixels`, which also provides
 * the tracking context used across the donation flow. Keeping this component as
 * a no-op prevents duplicate Meta/GA/TikTok/X init calls and duplicate PageView
 * events without changing any dashboard or website design.
 */
export function DirectTrackingScripts() {
  return null;
}
