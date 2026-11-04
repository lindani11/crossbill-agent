import "server-only";

/**
 * USD to ZAR exchange rates from Frankfurter (free, no key, European Central
 * Bank reference rates, published on working days). PayPal can't price in
 * rand, so Crossbill records the rand value itself.
 */

export type FxRate = { rate: number; date: string; source: "frankfurter" };

export async function usdToZar(onDate?: string): Promise<FxRate | null> {
  // Frankfurter returns the latest available rate on or before the date.
  const path = onDate ? onDate.slice(0, 10) : "latest";
  try {
    const res = await fetch(`https://api.frankfurter.app/${path}?from=USD&to=ZAR`, {
      next: { revalidate: 60 * 60 * 6 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { date: string; rates?: { ZAR?: number } };
    const rate = json.rates?.ZAR;
    return rate ? { rate, date: json.date, source: "frankfurter" } : null;
  } catch (err) {
    console.error("[fx] rate lookup failed", err);
    return null;
  }
}

export function formatZar(value: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(value);
}
