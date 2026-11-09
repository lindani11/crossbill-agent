/**
 * lib/money.ts · Money, date and tax-period helpers
 *
 * Used by the server (agent tools, PDF) and the browser (cards, tables,
 * statement), so it holds no secrets and imports nothing server-only. One
 * formatter means "$870.00" and "R14,276.70" look the same everywhere.
 *
 * Key ideas
 *   1. Intl.NumberFormat knows every currency's symbol and separators.
 *   2. Dates travel as "YYYY-MM-DD" text. In that format, text order is date
 *      order ("2026-03-01" < "2026-11-19"), with no time zones involved.
 *   3. The South African tax year runs from 1 March to the end of February.
 */

// Two decimals with thousands separators: 1151.9 → "1,151.90".
const DIGITS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** How a line's quantity reads on screen, e.g. "20 h × $12.00/h" or "Flat fee". */
export function describeQuantity(item: { quantity: number; unit_amount: number; unit?: string }): string {
  if (item.unit === "AMOUNT") return "Flat fee";
  const qty = new Intl.NumberFormat("en-US").format(item.quantity);
  const rate = formatMoney(item.unit_amount, "USD");
  return item.unit === "HOURS" ? `${qty} h × ${rate}/h` : `${qty} × ${rate}`;
}

/** "$1,151.89", "R1,151.89", "₹1,151.89", "KES 1,151.89". */
export function formatMoney(value: number, currency: string): string {
  const cur = currency.toUpperCase();
  // South Africans write rand as R1,151.89; Intl puts a space after the R.
  if (cur === "ZAR") return `${value < 0 ? "-" : ""}R${DIGITS.format(Math.abs(value))}`;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: cur,
      currencyDisplay: "narrowSymbol",
    })
      .format(value)
      // Intl can put a non-breaking space after a code (e.g. "KES"); use a plain one.
      .replace(/\u00a0/g, " ");
  } catch {
    // An unknown currency code (Intl throws): show the code itself.
    return `${cur} ${DIGITS.format(value)}`;
  }
}

/** "South African rand" from "ZAR"; falls back to the code. */
export function currencyName(currency: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "currency" }).of(currency.toUpperCase());
    // Currency names are lower case in English prose: "South African rand".
    return name ? name.replace("South African Rand", "South African rand") : currency;
  } catch {
    return currency;
  }
}

// Fixed English month names, so the server and the browser always render the
// same text (no locale differences, no hydration mismatch).
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "19 Nov 2026" from "2026-11-19". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  // Read by hand, not with new Date(), so a date can never shift by a day in
  // another time zone.
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Nov 2026" from "2026-11". */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return y && m ? `${MONTHS[m - 1]} ${y}` : ym;
}

// 3 → "03"
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// `month` is 1-12 here, but Date.UTC counts months from 0, so (year, month, 0)
// is "day 0" of the next month: the last day of this one (28 or 29 for Feb).
function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// A date range with a label, e.g. a tax year or "Nov 2026". Both ends inclusive.
export type Period = { from: string; to: string; label: string };

/**
 * South African tax year (year of assessment) for individuals: 1 March to the
 * last day of February. The "2027 tax year" ends in February 2027.
 */
export function saTaxYear(endYear: number): Period {
  return {
    from: `${endYear - 1}-03-01`,
    to: `${endYear}-02-${pad(lastDayOfMonth(endYear, 2))}`,
    label: `Tax year ${endYear - 1}/${String(endYear).slice(2)} (1 Mar ${endYear - 1} to ${lastDayOfMonth(endYear, 2)} Feb ${endYear})`,
  };
}

/** The tax year that contains the given date (default today). */
export function currentSaTaxYearEnd(today = new Date()): number {
  const y = today.getUTCFullYear();
  return today.getUTCMonth() >= 2 ? y + 1 : y; // March is month 2
}

/** One calendar month, e.g. monthPeriod(2026, 11) → 2026-11-01 to 2026-11-30. */
export function monthPeriod(year: number, month: number): Period {
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
    label: `${MONTHS[month - 1]} ${year}`,
  };
}

/**
 * True for a real calendar date written as YYYY-MM-DD. Every date from a URL
 * or a tool call is checked with it. The round trip through Date rejects
 * dates such as 2026-02-30, which Date.parse alone would roll over to March.
 */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
