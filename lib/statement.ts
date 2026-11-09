import "server-only";
import { byMonth, getLedger, paymentsIn, round2, type LedgerPayment, type MonthTotal } from "./ledger";
import { FX_SOURCE_LABEL } from "./fx";
import { currentSaTaxYearEnd, saTaxYear, type Period } from "./money";

/**
 * lib/statement.ts · The income statement for a period, and its CSV
 *
 * Every payment received in the period, each converted at the exchange rate
 * for the day it was paid, with monthly and period totals. For South African
 * individuals this is the default method in SARS Interpretation Note 63
 * (section 25D): the spot rate on the date the income is received.
 *
 * How it connects
 *   lib/ledger.ts getLedger(100) → paymentsIn(period) → buildStatement()
 *   buildStatement() is used by
 *     app/api/statement → JSON for the Statement page
 *                       → statementCsv() for the CSV download
 *                       → lib/statement-pdf.ts for the PDF download
 *     lib/agent.ts      → the income_statement tool
 */

/** Everything the Statement page, the PDF and the CSV show. */
export type Statement = {
  business: string | null;
  currency: string;
  period: Period;
  generated_at: string;
  totals: { payments: number; usd: number; local: number; average_rate: number | null; missing_rates: number };
  months: MonthTotal[];
  payments: LedgerPayment[];
  rate_sources: string[];
  method: string;
};

/** When no dates are given: the current South African tax year. */
export function defaultPeriod(): Period {
  return saTaxYear(currentSaTaxYearEnd());
}

// The "How the values are worked out" text, on the page and in the PDF.
function methodNote(currency: string): string {
  const base =
    "Each payment is converted from US dollars at the exchange rate for the day it was paid. " +
    "On weekends and public holidays the European Central Bank publishes no rate, so the last working day's rate is used; the rate date column shows which day.";
  if (currency === "ZAR") {
    return (
      base +
      " This follows the default rule for individuals in SARS Interpretation Note 63 (section 25D of the Income Tax Act): translate foreign income at the spot rate on the date it is received." +
      " Individuals may instead elect the average exchange rate for the year of assessment. Crossbill keeps records; it is not tax advice."
    );
  }
  return base + " Check your own tax authority's rules for which rate to use. Crossbill keeps records; it is not tax advice.";
}

/** Builds the statement from live PayPal data (up to 100 invoices, one PayPal page). */
export async function buildStatement(period: Period = defaultPeriod()): Promise<Statement> {
  const { currency, rows } = await getLedger(100);
  const payments = paymentsIn(rows, period.from, period.to);
  const usd = round2(payments.reduce((s, p) => s + p.amount_usd, 0));
  const local = round2(payments.reduce((s, p) => s + (p.amount_local ?? 0), 0));
  // The average rate counts only payments that have a rate, so a missing rate
  // can't drag it down.
  const convertedUsd = payments.filter((p) => p.amount_local !== null).reduce((s, p) => s + p.amount_usd, 0);
  // Which rate sources were used (usually only the ECB), for the method note.
  const sources = [...new Set(payments.map((p) => p.fx_source).filter((s): s is NonNullable<typeof s> => Boolean(s)))];

  return {
    business: process.env.BUSINESS_NAME?.trim() || null,
    currency,
    period,
    generated_at: new Date().toISOString(),
    totals: {
      payments: payments.length,
      usd,
      local,
      average_rate: convertedUsd > 0 ? Math.round((local / convertedUsd) * 10_000) / 10_000 : null,
      missing_rates: payments.filter((p) => p.amount_local === null).length,
    },
    months: byMonth(payments),
    payments,
    rate_sources: sources.map((s) => FX_SOURCE_LABEL[s]),
    method: methodNote(currency),
  };
}

// CSV quoting (RFC 4180): wrap a value in quotes when it holds a comma, quote
// or line break, and double any quotes inside it.
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV for an accountant or a spreadsheet: one row per payment, plain numbers. */
export function statementCsv(st: Statement): string {
  const cur = st.currency;
  const header = [
    "date_paid",
    "invoice_number",
    "client",
    "amount_usd",
    `usd_to_${cur.toLowerCase()}_rate`,
    "rate_date",
    "rate_source",
    `amount_${cur.toLowerCase()}`,
  ];
  const lines = st.payments.map((p) =>
    [
      p.paid_on,
      p.invoice_number,
      p.client,
      p.amount_usd.toFixed(2),
      p.fx_rate ?? "",
      p.fx_date,
      p.fx_source ? FX_SOURCE_LABEL[p.fx_source] : "",
      p.amount_local === null ? "" : p.amount_local.toFixed(2),
    ]
      .map(csvCell)
      .join(","),
  );
  // A UTF-8 byte-order mark so Excel reads accented client names correctly,
  // and CRLF line endings, as the CSV standard (RFC 4180) specifies.
  return "﻿" + [header.join(","), ...lines].join("\r\n") + "\r\n";
}
