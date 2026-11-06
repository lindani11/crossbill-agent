"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  currencyName,
  currentSaTaxYearEnd,
  formatDate,
  formatMoney,
  formatMonth,
  monthPeriod,
  saTaxYear,
  type Period,
} from "@/lib/money";

type Payment = {
  invoice_id: string;
  invoice_number: string | null;
  client: string | null;
  paid_on: string;
  amount_usd: number;
  fx_rate: number | null;
  fx_date: string | null;
  fx_source: "ecb" | "community" | "parity" | null;
  amount_local: number | null;
};

type Statement = {
  business: string | null;
  currency: string;
  period: Period;
  generated_at: string;
  totals: { payments: number; usd: number; local: number; average_rate: number | null; missing_rates: number };
  months: { month: string; payments: number; usd: number; local: number }[];
  payments: Payment[];
  rate_sources: string[];
  method: string;
};

type Preset = { id: string; label: string; period: Period };

function presets(currency: string): Preset[] {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const last = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const list: Preset[] = [];
  if (currency === "ZAR") {
    const end = currentSaTaxYearEnd(now);
    list.push(
      { id: "this-tax", label: "This tax year", period: saTaxYear(end) },
      { id: "last-tax", label: "Last tax year", period: saTaxYear(end - 1) },
    );
  } else {
    list.push(
      { id: "this-year", label: "This year", period: { from: `${y}-01-01`, to: `${y}-12-31`, label: `Calendar year ${y}` } },
      { id: "last-year", label: "Last year", period: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: `Calendar year ${y - 1}` } },
    );
  }
  list.push(
    { id: "this-month", label: "This month", period: monthPeriod(y, m) },
    { id: "last-month", label: "Last month", period: monthPeriod(last.y, last.m) },
  );
  return list;
}

function Tile({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${accent ? "text-[var(--accent)]" : ""}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-[var(--muted)]">{sub}</p> : null}
    </div>
  );
}

const th = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--muted)]";
const thNum = `${th} text-right`;
const td = "px-3 py-2 align-top";
const tdNum = `${td} text-right tabular-nums`;

export default function StatementView({ initialFrom, initialTo }: { initialFrom?: string; initialTo?: string }) {
  const [range, setRange] = useState<{ from?: string; to?: string }>({ from: initialFrom, to: initialTo });
  const [draft, setDraft] = useState<{ from: string; to: string }>({ from: initialFrom ?? "", to: initialTo ?? "" });
  const [st, setSt] = useState<Statement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const query = range.from && range.to ? `?from=${range.from}&to=${range.to}` : "";

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/statement${query}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not build the statement");
      setSt(json);
      setDraft({ from: json.period.from, to: json.period.to });
      // Keep the address shareable, e.g. /statement?from=2026-03-01&to=2027-02-28
      try {
        window.history.replaceState(null, "", `/statement?from=${json.period.from}&to=${json.period.to}`);
      } catch {
        // ignore
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the statement");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const cur = st?.currency ?? "ZAR";
  const options = useMemo(() => presets(cur), [cur]);
  const activePreset = st ? options.find((p) => p.period.from === st.period.from && p.period.to === st.period.to)?.id : undefined;
  const local = (v: number | null) => (v === null ? "—" : formatMoney(v, cur));
  const localWord = cur === "ZAR" ? "rand" : cur;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <section className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Income statement</h2>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            {st?.business ?? "Freelance income"}
            {st ? ` · ${st.period.label}` : ""}
          </p>
          <p className="mt-0.5 text-sm text-[var(--muted)]">
            Payments received through PayPal, in US dollars and {currencyName(cur)} at each payment day&apos;s rate.
          </p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          <a
            href={st ? `/api/statement?from=${st.period.from}&to=${st.period.to}&format=csv` : "#"}
            aria-disabled={!st}
            className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-semibold text-[var(--accent-ink)]"
          >
            Download CSV
          </a>
          <button
            onClick={() => window.print()}
            disabled={!st}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-60"
          >
            Print or save as PDF
          </button>
        </div>
      </section>

      <section className="no-print flex flex-wrap items-end gap-2">
        <div className="flex flex-wrap gap-1 rounded-full border border-[var(--line)] p-1">
          {options.map((p) => (
            <button
              key={p.id}
              onClick={() => setRange({ from: p.period.from, to: p.period.to })}
              className={`rounded-full px-3 py-1 text-sm ${
                activePreset === p.id
                  ? "bg-[var(--accent)] font-semibold text-[var(--accent-ink)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.from && draft.to && draft.from <= draft.to) setRange({ ...draft });
          }}
        >
          <label className="flex flex-col text-xs text-[var(--muted)]">
            From
            <input
              type="date"
              value={draft.from}
              onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
              className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)]"
            />
          </label>
          <label className="flex flex-col text-xs text-[var(--muted)]">
            To
            <input
              type="date"
              value={draft.to}
              onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
              className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 py-1 text-sm text-[var(--ink)]"
            />
          </label>
          <button
            type="submit"
            disabled={!draft.from || !draft.to || draft.from > draft.to}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-60"
          >
            Show
          </button>
        </form>
        {loading ? <span className="text-sm text-[var(--muted)]">Loading from PayPal…</span> : null}
      </section>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

      {st ? (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tile label="Payments" value={String(st.totals.payments)} sub="Received in this period" />
            <Tile label="Total in USD" value={formatMoney(st.totals.usd, "USD")} />
            <Tile label={`Total in ${localWord}`} value={formatMoney(st.totals.local, cur)} sub="Each at its payment day's rate" accent />
            <Tile
              label="Average rate"
              value={st.totals.average_rate ? st.totals.average_rate.toFixed(4) : "—"}
              sub={`${cur} per US dollar, weighted`}
            />
          </section>

          {st.totals.missing_rates > 0 ? (
            <p className="text-sm text-[var(--danger)]">
              {st.totals.missing_rates} payment{st.totals.missing_rates === 1 ? " has" : "s have"} no exchange rate yet,
              so {st.totals.missing_rates === 1 ? "it is" : "they are"} left out of the {localWord} total. Refresh later.
            </p>
          ) : null}

          {st.payments.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--line)] p-6 text-sm text-[var(--muted)]">
              No payments received in this period yet. Pay an invoice as the sandbox client, or pick another period.
            </p>
          ) : (
            <>
              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">By month</h3>
                <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface)]">
                  <table className="w-full min-w-[420px] border-collapse text-sm">
                    <thead className="border-b border-[var(--line)]">
                      <tr>
                        <th className={th}>Month</th>
                        <th className={thNum}>Payments</th>
                        <th className={thNum}>USD</th>
                        <th className={thNum}>{cur}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {st.months.map((m) => (
                        <tr key={m.month} className="border-b border-[var(--line)] last:border-0">
                          <td className={td}>{formatMonth(m.month)}</td>
                          <td className={tdNum}>{m.payments}</td>
                          <td className={tdNum}>{formatMoney(m.usd, "USD")}</td>
                          <td className={tdNum}>{formatMoney(m.local, cur)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">Every payment</h3>
                <div className="overflow-x-auto rounded-xl border border-[var(--line)] bg-[var(--surface)]">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead className="border-b border-[var(--line)]">
                      <tr>
                        <th className={th}>Date paid</th>
                        <th className={th}>Invoice</th>
                        <th className={th}>Client</th>
                        <th className={thNum}>USD</th>
                        <th className={thNum}>USD/{cur}</th>
                        <th className={th}>Rate date</th>
                        <th className={thNum}>{cur}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {st.payments.map((p, i) => (
                        <tr key={`${p.invoice_id}-${p.paid_on}-${i}`} className="border-b border-[var(--line)]">
                          <td className={td}>{formatDate(p.paid_on)}</td>
                          <td className={td}>{p.invoice_number ? `#${p.invoice_number}` : ""}</td>
                          <td className={td}>{p.client ?? ""}</td>
                          <td className={tdNum}>{formatMoney(p.amount_usd, "USD")}</td>
                          <td className={tdNum}>{p.fx_rate ? p.fx_rate.toFixed(4) : "—"}</td>
                          <td className={`${td} text-[var(--muted)]`}>
                            {p.fx_date && p.fx_date !== p.paid_on ? formatDate(p.fx_date) : p.fx_date ? "Same day" : "—"}
                          </td>
                          <td className={`${tdNum} font-semibold`}>{local(p.amount_local)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td className={`${td} font-semibold`} colSpan={3}>
                          Total
                        </td>
                        <td className={`${tdNum} font-semibold`}>{formatMoney(st.totals.usd, "USD")}</td>
                        <td className={tdNum} />
                        <td className={td} />
                        <td className={`${tdNum} font-semibold text-[var(--accent)]`}>{formatMoney(st.totals.local, cur)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            </>
          )}

          <section className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-sm">
            <h3 className="font-semibold">How the {localWord} values are worked out</h3>
            <p className="mt-1 text-[var(--muted)]">{st.method}</p>
            {cur === "ZAR" ? (
              <p className="mt-2">
                <a
                  className="text-[var(--accent)] hover:underline"
                  href="https://www.sars.gov.za/lapd-intr-in-2012-63-rules-translation-amounts-foreign-currencies"
                  target="_blank"
                  rel="noreferrer"
                >
                  SARS Interpretation Note 63
                </a>
                {" · "}
                <a
                  className="text-[var(--accent)] hover:underline"
                  href="https://www.sars.gov.za/legal-pub-aer-01-average-exchange-rates-specific-provisions-income-tax-act"
                  target="_blank"
                  rel="noreferrer"
                >
                  SARS average exchange rates
                </a>
              </p>
            ) : null}
            <p className="mt-2 text-xs text-[var(--muted)]">
              Rates: {st.rate_sources.length ? st.rate_sources.join("; ") : "none needed"}. Built live from PayPal on{" "}
              {formatDate(st.generated_at)}. Demo data from the PayPal sandbox.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
