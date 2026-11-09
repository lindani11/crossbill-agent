import "server-only";
import { formatMoney } from "./money";

/**
 * lib/fx.ts · Exchange rates: USD to the freelancer's currency on a given day
 *
 * PayPal can't invoice in rand (or many other currencies), so Crossbill keeps
 * the local value of every payment itself.
 *
 * Where the rates come from, in order
 *   1. Frankfurter: European Central Bank reference rates, free, no key. About
 *      30 currencies (ZAR, INR, PHP, BRL, MXN...). On weekends and holidays it
 *      returns the last working day's rate, and `date` says which day that was.
 *   2. Fallback: the open-source exchange-api by fawazahmed0 (daily community
 *      rates), for currencies the ECB doesn't publish, such as KES and NGN, or
 *      if Frankfurter is down.
 *
 * How it connects
 *   lib/ledger.ts (each payment date) → usdToLocal() → cache, else lookup()
 *     lookup(): Frankfurter → community rates for that day → latest community
 *   The { rate, date, source } it returns is kept on the payment, so the
 *   statement shows which day's rate was used and where it came from.
 */

// "parity" means USD to USD (rate 1), for a freelancer whose currency is USD.
export type FxSource = "ecb" | "community" | "parity";
type FxRate = { rate: number; date: string; source: FxSource };

// How each source is named on the statement, the PDF and the CSV.
export const FX_SOURCE_LABEL: Record<FxSource, string> = {
  ecb: "European Central Bank reference rate (via Frankfurter)",
  community: "Daily community rate (exchange-api)",
  parity: "Same currency",
};

/** The freelancer's home currency from LOCAL_CURRENCY; anything but a 3-letter code means ZAR. */
export function localCurrency(): string {
  const raw = (process.env.LOCAL_CURRENCY || "ZAR").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : "ZAR";
}

// Past rates never change, so keep them (and in-flight lookups) per server.
const cache = new Map<string, Promise<FxRate | null>>();

// GET https://api.frankfurter.app/2026-11-06?from=USD&to=ZAR
//   → { "date": "2026-11-06", "rates": { "ZAR": ... } }
// Ask for a Saturday and `date` comes back as the Friday the rate is for.
async function fromFrankfurter(currency: string, day: string): Promise<FxRate | null> {
  const res = await fetch(`https://api.frankfurter.app/${day}?from=USD&to=${currency}`, { cache: "no-store" });
  if (!res.ok) return null; // 404 or 422 for a currency the ECB doesn't publish
  const json = (await res.json()) as { date?: string; rates?: Record<string, number> };
  const rate = json.rates?.[currency];
  return rate && json.date ? { rate, date: json.date, source: "ecb" } : null;
}

// The same daily files on two mirrors (jsDelivr, Cloudflare Pages): the first
// one that answers wins.
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

// The fallback chain: ECB for that day → community rates for that day →
// the latest community rate.
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
  // Same currency: nothing to look up.
  if (cur === "USD") return { rate: 1, date: day === "latest" ? new Date().toISOString().slice(0, 10) : day, source: "parity" };

  const today = new Date().toISOString().slice(0, 10);
  // Only past days are cached: today's rate may not be published yet.
  const cacheable = day !== "latest" && day < today;
  const key = `${cur}:${day}`;
  if (cacheable && cache.has(key)) return cache.get(key)!;

  // Cache the promise itself, so several payments on one day share one request.
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

/** An amount in the freelancer's currency, e.g. "R1,151.89". */
export function formatLocal(value: number): string {
  return formatMoney(value, localCurrency());
}
