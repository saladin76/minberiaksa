export function normalizeGoogleSearchConsoleVerification(value: unknown): string | null {
  if (typeof value !== "string") return null;

  let token = value.trim();
  if (!token) return null;

  const marker = "google-site-verification";
  const markerIndex = token.toLowerCase().indexOf(marker);
  if (markerIndex >= 0) {
    token = token.slice(markerIndex + marker.length).trim();
    token = token.replace(/^[:=]/, "").trim();
  }

  const contentIndex = token.toLowerCase().indexOf("content=");
  if (contentIndex >= 0) {
    token = token.slice(contentIndex + "content=".length).trim();
  }

  token = token.replace(/^['\"]+|['\">]+$/g, "").trim();
  return token || null;
}
