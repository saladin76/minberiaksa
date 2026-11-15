/**
 * Server-side choice of the GA4 session for a donation's Measurement Protocol event.
 *
 * GA4 stores one session cookie per web stream: `_ga_<MEASUREMENT_ID without "G-">`.
 * The browser captures every stream as `SUFFIX:session` pairs (ga_session_streams);
 * only the server knows which Measurement ID it sends to, so it picks the exact match.
 * No match → no session_id (same as before), never a guess from another property.
 */
const STREAMS_RE = /^[A-Z0-9]{1,24}:\d{10}(?:,[A-Z0-9]{1,24}:\d{10}){0,7}$/;

export function parseGa4SessionStreams(value: unknown): Map<string, string> | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toUpperCase();
  if (!STREAMS_RE.test(v)) return undefined;
  const map = new Map<string, string>();
  for (const pair of v.split(",")) {
    const [suffix, session] = pair.split(":");
    if (map.has(suffix) && map.get(suffix) !== session) map.set(suffix, "");
    else map.set(suffix, session);
  }
  return map;
}

export function ga4SessionIdForMeasurement(attribution: Record<string, unknown> | undefined, measurementId: string): number | undefined {
  const suffix = String(measurementId ?? "").trim().toUpperCase().replace(/^G-/, "");
  if (!/^[A-Z0-9]{1,24}$/.test(suffix)) return undefined;
  const raw = attribution?.ga_session_streams;
  if (raw != null && raw !== "") {
    const session = parseGa4SessionStreams(raw)?.get(suffix);
    return session ? Number(session) : undefined;
  }
  // Older donations: only a single, well-formed session id is trusted.
  const legacy = typeof attribution?.ga_session_id === "string" ? attribution.ga_session_id.trim() : "";
  return /^\d{10}$/.test(legacy) ? Number(legacy) : undefined;
}
