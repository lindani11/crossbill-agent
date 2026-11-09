import "server-only";
import { getInvoice, listInvoices, type PayPalInvoice } from "./paypal";
import { localCurrency, usdToLocal, type FxSource } from "./fx";

/**
 * lib/ledger.ts · The books, rebuilt live from PayPal on every request
 *
 * Turns PayPal invoices into rows (who owes what) and payments (what arrived,
 * on which day, and its value in the freelancer's currency at that day's rate).
 *
 * How it connects
 *   lib/paypal.ts listInvoices() → getLedger() → rows, each with its payments
 *     each payment date → lib/fx.ts usdToLocal() → rate, rate date, source
 *   getLedger() is read by
 *     app/api/ledger   → Dashboard (AG Grid table, AG Studio report)
 *     lib/statement.ts → Statement page, PDF and CSV
 *     lib/agent.ts     → the list_invoices and earnings tools
 *
 * Key ideas
 *   1. No database: PayPal is the single source of truth, so the books can't
 *      drift out of sync with what clients actually paid.
 *   2. Each PayPal transaction is its own payment, so every part-payment gets
 *      the rate for its own day (SARS Interpretation Note 63).
 *   3. Amounts are rounded to cents (round2) whenever they are added up.
 */

/** One payment received: the unit the statement and the tax rule work with. */
export type LedgerPayment = {
  invoice_id: string;
  invoice_number: string | null;
  client: string | null;
  paid_on: string; // YYYY-MM-DD
  amount_usd: number;
  fx_rate: number | null; // 1 USD in local currency
  fx_date: string | null; // the day the rate is for
  fx_source: FxSource | null;
  amount_local: number | null;
};

/** One invoice, as the Dashboard table shows it. */
type LedgerRow = {
  id: string;
  number: string | null;
  client: string | null;
  client_email: string | null;
  status: string;
  invoice_date: string | null;
  due_date: string | null;
  total_usd: number | null;
  due_usd: number | null;
  paid_usd: number | null;
  paid_on: string | null; // latest payment
  fx_rate: number | null; // weighted over this invoice's payments
  fx_date: string | null;
  paid_local: number | null;
  days_overdue: number | null;
  payments: LedgerPayment[];
};

type Ledger = { currency: string; rows: LedgerRow[] };

// Statuses where money has arrived, and where money is still owed.
// PARTIALLY_PAID is in both: part has arrived and the rest is still due.
const PAID_STATUSES = new Set(["PAID", "PARTIALLY_PAID", "MARKED_AS_PAID"]);
const OPEN_STATUSES = new Set(["SENT", "UNPAID", "PARTIALLY_PAID", "SCHEDULED"]);

// PayPal sends amounts as strings ("70.00"); null (not NaN) when missing.
function num(value?: string): number | null {
  const n = value === undefined ? NaN : Number(value);
  return Number.isFinite(n) ? n : null;
}

// Round to cents. Floating-point sums drift (0.1 + 0.2 = 0.30000000000000004),
// so totals are rounded every time they are added up.
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// The client's display name and email, from the invoice's first recipient.
function clientOf(inv: PayPalInvoice) {
  const r = inv.primary_recipients?.[0]?.billing_info;
  const name = r?.name?.full_name ?? [r?.name?.given_name, r?.name?.surname].filter(Boolean).join(" ");
  return { name: name || null, email: r?.email_address ?? null };
}

// Days past the due date for an invoice that is still open, else null (not 0),
// so the table shows a blank and filter((r) => r.days_overdue) skips it.
// Like every YYYY-MM-DD in Crossbill, the dates are compared in UTC.
function daysOverdue(status: string, dueDate: string | null): number | null {
  if (!dueDate || !OPEN_STATUSES.has(status)) return null;
  const today = new Date().toISOString().slice(0, 10);
  const days = Math.floor((Date.parse(today) - Date.parse(dueDate)) / 86_400_000);
  return days > 0 ? days : null;
}

/** One entry per PayPal transaction, so part-payments each get their own day's rate. */
function paymentsOf(inv: PayPalInvoice): { paid_on: string; amount_usd: number }[] {
  const paidUsd = num(inv.payments?.paid_amount?.value);
  const txs = (inv.payments?.transactions ?? [])
    .map((t) => ({ paid_on: t.payment_date?.slice(0, 10) ?? "", amount_usd: num(t.amount?.value) }))
    .filter((t): t is { paid_on: string; amount_usd: number } => Boolean(t.paid_on) && t.amount_usd !== null && t.amount_usd > 0);

  if (txs.length > 0) return txs.sort((a, b) => a.paid_on.localeCompare(b.paid_on));

  // No per-transaction amounts: one payment of the paid total on the last payment date.
  const lastDate = (inv.payments?.transactions ?? [])
    .map((t) => t.payment_date?.slice(0, 10))
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  return paidUsd && lastDate ? [{ paid_on: lastDate, amount_usd: paidUsd }] : [];
}

/** One ledger row for an invoice, with its payments converted to local currency. */
async function toRow(summary: PayPalInvoice): Promise<LedgerRow> {
  // The list endpoint can leave out payment details, so re-read paid invoices.
  let inv = summary;
  if (PAID_STATUSES.has(summary.status)) {
    try {
      inv = await getInvoice(summary.id);
    } catch (err) {
      console.error("[ledger] could not re-read invoice", summary.id, err);
    }
  }

  const { name, email } = clientOf(inv);
  const number = inv.detail?.invoice_number ?? null;

  // Convert every payment at the rate for its own date, all in parallel.
  const payments: LedgerPayment[] = await Promise.all(
    paymentsOf(inv).map(async (p) => {
      const fx = await usdToLocal(p.paid_on);
      return {
        invoice_id: inv.id,
        invoice_number: number,
        client: name,
        paid_on: p.paid_on,
        amount_usd: p.amount_usd,
        fx_rate: fx?.rate ?? null,
        fx_date: fx?.date ?? null,
        fx_source: fx?.source ?? null,
        amount_local: fx ? round2(p.amount_usd * fx.rate) : null,
      };
    }),
  );

  // Row totals. The local total only shows when every payment has a rate, so a
  // half-converted figure is never presented as complete.
  const paidUsd = payments.length ? round2(payments.reduce((s, p) => s + p.amount_usd, 0)) : num(inv.payments?.paid_amount?.value);
  const allConverted = payments.length > 0 && payments.every((p) => p.amount_local !== null);
  const paidLocal = allConverted ? round2(payments.reduce((s, p) => s + (p.amount_local ?? 0), 0)) : null;
  const last = payments.at(-1);
  const dueDate = inv.detail?.payment_term?.due_date ?? null;

  return {
    id: inv.id,
    number,
    client: name,
    client_email: email,
    status: inv.status,
    invoice_date: inv.detail?.invoice_date ?? null,
    due_date: dueDate,
    total_usd: num(inv.amount?.value),
    due_usd: num(inv.due_amount?.value),
    paid_usd: paidUsd && paidUsd > 0 ? paidUsd : null,
    paid_on: last?.paid_on ?? null,
    // One payment: its own rate. Several: the weighted average (local ÷ USD),
    // so the row still reconciles with its payments.
    fx_rate:
      payments.length === 1
        ? payments[0].fx_rate
        : paidLocal !== null && paidUsd
          ? Math.round((paidLocal / paidUsd) * 10_000) / 10_000
          : null,
    fx_date: last?.fx_date ?? null,
    paid_local: paidLocal,
    days_overdue: daysOverdue(inv.status, dueDate),
    payments,
  };
}

/**
 * The whole ledger: one list call, then every row built in parallel. Only one
 * page of invoices is read (pageSize, at most 100): see "Known limitations"
 * in docs/ARCHITECTURE.md.
 */
export async function getLedger(pageSize = 50): Promise<Ledger> {
  const invoices = await listInvoices(pageSize);
  const rows = await Promise.all(invoices.map(toRow));
  return { currency: localCurrency(), rows };
}

/** Every payment, oldest first, optionally limited to a date range (inclusive, YYYY-MM-DD). */
export function paymentsIn(rows: LedgerRow[], from?: string, to?: string): LedgerPayment[] {
  return rows
    .flatMap((r) => r.payments)
    .filter((p) => (!from || p.paid_on >= from) && (!to || p.paid_on <= to))
    .sort((a, b) => a.paid_on.localeCompare(b.paid_on) || (a.invoice_number ?? "").localeCompare(b.invoice_number ?? ""));
}

type Totals = {
  outstanding_usd: number;
  overdue_usd: number;
  overdue_count: number;
  paid_usd: number;
  paid_local: number;
  paid_count: number;
  missing_rates: number;
};

/**
 * Totals over a ledger. Paid figures can be limited to a date range;
 * outstanding and overdue are always as of today.
 */
export function totals(rows: LedgerRow[], from?: string, to?: string): Totals {
  const paid = paymentsIn(rows, from, to);
  const open = rows.filter((r) => OPEN_STATUSES.has(r.status) && (r.due_usd ?? 0) > 0);
  const overdue = open.filter((r) => r.days_overdue);
  return {
    outstanding_usd: round2(open.reduce((s, r) => s + (r.due_usd ?? 0), 0)),
    overdue_usd: round2(overdue.reduce((s, r) => s + (r.due_usd ?? 0), 0)),
    overdue_count: overdue.length,
    paid_usd: round2(paid.reduce((s, p) => s + p.amount_usd, 0)),
    paid_local: round2(paid.reduce((s, p) => s + (p.amount_local ?? 0), 0)),
    paid_count: paid.length,
    missing_rates: paid.filter((p) => p.amount_local === null).length,
  };
}

export type MonthTotal = { month: string; payments: number; usd: number; local: number };

/** Payment totals per calendar month (YYYY-MM), oldest first. */
export function byMonth(payments: LedgerPayment[]): MonthTotal[] {
  const map = new Map<string, MonthTotal>();
  for (const p of payments) {
    const month = p.paid_on.slice(0, 7);
    const m = map.get(month) ?? { month, payments: 0, usd: 0, local: 0 };
    m.payments += 1;
    m.usd = round2(m.usd + p.amount_usd);
    m.local = round2(m.local + (p.amount_local ?? 0));
    map.set(month, m);
  }
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}
