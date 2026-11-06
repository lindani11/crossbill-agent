/**
 * Formatting and tax-period helpers shared by the server and the browser.
 * No secrets and no server-only imports here.
 */

const DIGITS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
      .replace(/ /g, " ");
  } catch {
    return `${cur} ${DIGITS.format(value)}`;
  }
}

export const formatUsd = (value: number) => formatMoney(value, "USD");

/** "South African rand" from "ZAR"; falls back to the code. */
export function currencyName(currency: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "currency" }).of(currency.toUpperCase());
    return name ? name.replace("South African Rand", "South African rand") : currency;
  } catch {
    return currency;
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "19 Nov 2026" from "2026-11-19". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Nov 2026" from "2026-11". */
export function formatMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return y && m ? `${MONTHS[m - 1]} ${y}` : ym;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

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

export function monthPeriod(year: number, month: number): Period {
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(lastDayOfMonth(year, month))}`,
    label: `${MONTHS[month - 1]} ${year}`,
  };
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}
