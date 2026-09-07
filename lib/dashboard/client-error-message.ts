/**
 * Pull the server's message out of a failed dashboard request.
 *
 * The dashboard forms showed a hard-coded "فشل التحديث" on every rejection, so
 * an admin could not tell a validation problem from a database timeout, and the
 * server's own Arabic explanation — which the API routes do send — was thrown
 * away. This reads that message when there is one and keeps the caller's
 * fallback otherwise.
 *
 * Deliberately structural rather than `axios.isAxiosError`: the same helper is
 * used with plain `fetch` wrappers, and this avoids pulling axios into modules
 * that don't otherwise need it.
 */
export function errorMessage(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: unknown } })?.response?.data;

  if (typeof data === "string" && data.trim()) return data.trim();

  if (data && typeof data === "object") {
    for (const key of ["error", "message", "detail"] as const) {
      const v = (data as Record<string, unknown>)[key];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }

  // No response at all means the request never completed — offline, blocked, or
  // the serverless function timed out. That is worth saying explicitly.
  const hasResponse = !!(error as { response?: unknown })?.response;
  const code = (error as { code?: string })?.code;
  if (!hasResponse && (code === "ECONNABORTED" || code === "ERR_NETWORK")) {
    return "تعذّر الوصول إلى الخادم. تحقّق من الاتصال وحاول مرة أخرى.";
  }

  return fallback;
}
