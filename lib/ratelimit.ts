import "server-only";

/**
 * lib/ratelimit.ts · A small per-IP rate limiter (sliding window, in memory)
 *
 * Protects the free AI quota and the PayPal API from any one visitor sending
 * too many requests. Each key keeps the times of its recent requests, and a
 * request is allowed while fewer than `limit` fall inside the window.
 *
 * How it connects
 *   every app/api route → rateLimit(`<route>:<ip>`, limit) → 429 when over
 *
 * Limits: the memory is per server instance and resets on restart, which suits
 * a demo. A shared store (such as Upstash Redis) would make it global.
 */
const hits = new Map<string, number[]>();

/** true if this request is allowed. Default: 20 requests per 10 minutes per key. */
export function rateLimit(key: string, limit = 20, windowMs = 10 * 60_000): boolean {
  const now = Date.now();
  // Keep memory bounded: now and then, drop keys with no recent hits.
  if (hits.size > 5_000) {
    for (const [k, times] of hits) if (!times.some((t) => now - t < windowMs)) hits.delete(k);
  }
  // Sliding window: only hits from the last windowMs count.
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}

/**
 * The visitor's IP: the first address in x-forwarded-for, which Vercel sets
 * itself (replacing any value the visitor sends). "local" in development.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
