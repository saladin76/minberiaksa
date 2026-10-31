import { createHash } from "node:crypto";
type Reply = { text: string; status: number; headers: [string, string][] };
const completed = new Map<string, { reply: Reply; until: number }>();
const running = new Map<string, Promise<Reply>>();
const fetcherIds = new WeakMap<typeof fetch, number>();
let nextFetcherId = 0;
const stats = { providerRequests: 0, cacheHits: 0, coalescedRequests: 0 };
const TTL = 5 * 60_000, CAPACITY = 32;
export function aiRequestSavings() { return { ...stats, window: "since-process-start", cacheMinutes: 5 }; }
const response = (r: Reply, kind: string) => new Response(r.text, { status: r.status, headers: [...r.headers, ["x-ai-cache", kind]] });
/** Exact request reuse is isolated by endpoint, credentials and payload. Failed,
 * cancelled and incomplete responses are never cached; no content is persisted. */
export async function economicalAiFetch(url: string, init: RequestInit, fetcher: typeof fetch = fetch): Promise<Response> {
  if (init.signal?.aborted) throw init.signal.reason ?? new DOMException("Aborted", "AbortError");
  if (init.method !== "POST" || typeof init.body !== "string") return fetcher(url, init);
  if (!fetcherIds.has(fetcher)) fetcherIds.set(fetcher, ++nextFetcherId);
  const key = createHash("sha256").update(String(fetcherIds.get(fetcher))).update("\n").update(url).update("\n").update(new Headers(init.headers).get("authorization") ?? "").update("\n").update(init.body).digest("hex");
  const now = Date.now();
  for (const [id, row] of completed) if (row.until <= now) completed.delete(id);
  const cached = completed.get(key);
  if (cached) { stats.cacheHits++; return response(cached.reply, "HIT"); }
  const pending = running.get(key);
  if (pending) { stats.coalescedRequests++; const reply = await pending; if (init.signal?.aborted) throw init.signal.reason; return response(reply, "COALESCED"); }
  const task = (async () => {
    stats.providerRequests++;
    const result = await fetcher(url, init), text = await result.text();
    const reply: Reply = { text, status: result.status, headers: [...result.headers.entries()].filter(([name]) => !["content-length", "content-encoding", "transfer-encoding"].includes(name)) };
    let valid = false;
    try {
      const json = JSON.parse(text);
      valid = json.status === "completed" && (typeof json.output_text === "string" && json.output_text.trim().length > 0 || Array.isArray(json.output) && json.output.some((item: { content?: { type: string; text?: string }[] }) => item.content?.some(c => c.type === "output_text" && c.text?.trim()))) || Array.isArray(json.choices) && json.choices.some((choice: { finish_reason?: string; message?: { content?: string } }) => choice.finish_reason === "stop" && choice.message?.content?.trim());
    } catch { /* Invalid output must reach the normal validator, never the cache. */ }
    if (result.ok && valid && !init.signal?.aborted && Buffer.byteLength(text) < 500_000) {
      if (completed.size >= CAPACITY) completed.delete(completed.keys().next().value!);
      completed.set(key, { reply, until: Date.now() + TTL });
    }
    return reply;
  })();
  if (running.size < CAPACITY) running.set(key, task);
  try { return response(await task, "MISS"); } finally { if (running.get(key) === task) running.delete(key); }
}
