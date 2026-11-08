import "server-only";
import { formatMoney } from "./money";

/**
 * USD to local-currency exchange rates on a given day. PayPal can't invoice in
 * rand (or many other currencies), so Crossbill keeps the local value itself.
 *
 * 1. Frankfurter: European Central Bank reference rates, free, no key. About
 *    30 currencies (ZAR, INR, PHP, BRL, MXN...). On weekends and holidays it
 *    returns the last working day's rate, and `date` says which day that was.
 * 2. Fallback: the open-source exchange-api by fawazahmed0 (daily community
 *    rates), for currencies the ECB doesn't publish, such as KES and NGN, or
 *    if Frankfurter is down.
 */

export type FxSource = "ecb" | "community" | "parity";
type FxRate = { rate: number; date: string; source: FxSource };

export const FX_SOURCE_LABEL: Record<FxSource, string> = {
  ecb: "European Central Bank reference rate (via Frankfurter)",
  community: "Daily community rate (exchange-api)",
  parity: "Same currency",
};

/** The freelancer's home currency, from LOCAL_CURRENCY (default ZAR). */
export function localCurrency(): string {
  const raw = (process.env.LOCAL_CURRENCY || "ZAR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : "ZAR";
}

// Past rates never change, so keep them (and in-flight lookups) per server.
const cache = new Map<string, Promise<FxRate | null>>();

async function fromFrankfurter(currency: string, day: string): Promise<FxRate | null> {
  const res = await fetch(`https://api.frankfurter.app/${day}?from=USD&to=${currency}`, { cache: "no-store" });
  if (!res.ok) return null; // 404 or 422 for a currency the ECB doesn't publish
  const json = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const rate = json.rates?.[currency];
  return rate && json.date ? { rate, date: json.date, source: "ecb" } : null;
}

async function fromCommunity(currency: string, day: string): Promise<FxRate | null> {
  const tag = day === "latest" ? "latest" : day;
  const urls = [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${tag}/v1/currencies/usd.json`,
    `https://${tag}.currency-api.pages.dev/v1/currencies/usd.json`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) continue;
      const json = (await res.json()) as { date?: string; usd?: Record<string, number> };
      const rate = json.usd?.[currency.toLowerCase()];
      if (rate) return { rate, date: json.date ?? day, source: "community" };
    } catch {
      // try the next mirror
    }
  }
  return null;
}

async function lookup(currency: string, day: string): Promise<FxRate | null> {
  try {
    const ecb = await fromFrankfurter(currency, day);
    if (ecb) return ecb;
  } catch (err) {
    console.error("[fx] Frankfurter failed", currency, day, err);
  }
  try {
    const community = await fromCommunity(currency, day);
    if (community) return community;
    // No snapshot for that exact day yet (for example today): use the latest.
    if (day !== "latest") return await fromCommunity(currency, "latest");
  } catch (err) {
    console.error("[fx] community rates failed", currency, day, err);
  }
  return null;
}

/** USD to `currency` on `onDate` (YYYY-MM-DD or an ISO timestamp); latest when omitted. */
async function usdTo(currency: string, onDate?: string): Promise<FxRate | null> {
  const cur = currency.toUpperCase();
  const day = onDate ? onDate.slice(0, 10) : "latest";
  if (cur === "USD") return { rate: 1, date: day === "latest" ? new Date().toISOString().slice(0, 10) : day, source: "parity" };

  const today = new Date().toISOString().slice(0, 10);
  const cacheable = day !== "latest" && day < today;
  const key = `${cur}:${day}`;
  if (cacheable && cache.has(key)) return cache.get(key)!;

  const pending = lookup(cur, day);
  if (cacheable) {
    cache.set(key, pending);
    // Don't keep a failed lookup: try again next time.
    pending.then((r) => {
      if (!r) cache.delete(key);
    });
  }
  return pending;
}

/** USD to the freelancer's local currency. */
export function usdToLocal(onDate?: string): Promise<FxRate | null> {
  return usdTo(localCurrency(), onDate);
}

export function formatLocal(value: number): string {
  return formatMoney(value, localCurrency());
}
