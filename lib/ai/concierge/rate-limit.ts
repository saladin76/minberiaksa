/**
 * Sliding-window limiter for the public concierge endpoints.
 *
 * In-memory, per server instance: on Vercel every warm function keeps its own
 * counters, so the real ceiling is this × the number of live instances. That
 * is enough to stop one browser looping the model endpoint, which is what the
 * limit is for; a shared store (Upstash/KV) can replace `hit` without changing
 * callers if abuse ever needs a global ceiling.
 */

const buckets = new Map<string, number[]>();
let lastSweep = Date.now();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function hit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  if (now - lastSweep > windowMs) {
    for (const [k, stamps] of buckets) {
      const live = stamps.filter((t) => now - t < windowMs);
      if (live.length) buckets.set(k, live);
      else buckets.delete(k);
    }
    lastSweep = now;
  }
  const stamps = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (stamps.length >= limit) {
    const oldest = stamps[0];
    return { ok: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)) };
  }
  stamps.push(now);
  buckets.set(key, stamps);
  return { ok: true, remaining: limit - stamps.length, retryAfterSeconds: 0 };
}

/** The caller's address as the platform reports it, else a shared bucket. */
export function clientKey(headers: Headers, scope: string): string {
  const fwd = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = fwd || headers.get("x-real-ip") || headers.get("cf-connecting-ip") || "anonymous";
  return `${scope}:${ip}`;
}
