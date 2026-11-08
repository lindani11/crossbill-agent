"use client";

import { useMemo, useState } from "react";
import { AgStudio } from "ag-studio-react";

// Without a licence key AG Studio prints a 7-line trial banner with
// console.error, which the Next.js dev overlay counts as "7 Issues". Drop only
// those banner lines so real errors still stand out. The trial watermark stays.
const LICENCE_BANNER = /^\s*\*+\s*$|AG Studio Core License|License Key Not Found|unlocked for trial|hide the watermark/;
if (typeof window !== "undefined" && !(console.error as { crossbill?: boolean }).crossbill) {
  const original = console.error.bind(console);
  const filtered = (...args: unknown[]) => {
    if (typeof args[0] === "string" && LICENCE_BANNER.test(args[0])) return;
    original(...args);
  };
  (filtered as { crossbill?: boolean }).crossbill = true;
  console.error = filtered;
}

type LedgerRow = {
  id: string;
  number: string | null;
  client: string | null;
  status: string;
  invoice_date: string | null;
  total_usd: number | null;
  due_usd: number | null;
  days_overdue: number | null;
  payments: {
    paid_on: string;
    amount_usd: number;
    fx_rate: number | null;
    amount_local: number | null;
  }[];
};

/**
 * Field names carry the currency (paid_zar, usd_zar_rate) so reports read
 * naturally in the builder. Saved reports are kept per currency.
 */
function fields(currency: string) {
  const c = currency.toLowerCase();
  return { paid: `paid_${c}`, rate: `usd_${c}_rate` };
}

const title = (text: string) => ({ format: { title: { text, enabled: true } } });

// Starting report: totals, local currency received per month and per client,
// and every payment with its rate. To change it: build it in Edit mode, copy
// the state logged to the browser console ("[ag-studio] report state"), and
// paste it here.
function defaultReport(currency: string, localWord: string) {
  const f = fields(currency);
  const paidLocal = { id: `payments.${f.paid}`, aggregation: "sum" };
  return {
    pages: [
      {
        id: "page-1",
        widgets: {
          kpiLocal: { type: "value", ...title(`Received in ${localWord}`), dataMapping: { value: [paidLocal] } },
          kpiUsd: {
            type: "value",
            ...title("Received in USD"),
            dataMapping: { value: [{ id: "payments.paid_usd", aggregation: "sum" }] },
          },
          kpiDue: {
            type: "value",
            ...title("Outstanding (USD)"),
            dataMapping: { value: [{ id: "invoices.due_usd", aggregation: "sum" }] },
          },
          byMonth: {
            type: "column-chart-grouped",
            ...title(`${localWord[0].toUpperCase()}${localWord.slice(1)} received per month`),
            dataMapping: { categoryKey: [{ id: "payments.paid_month" }], valueKey: [paidLocal] },
            sort: [{ field: { id: "payments.paid_month" }, direction: "asc" }],
          },
          byClient: {
            type: "donut-chart",
            ...title(`${localWord[0].toUpperCase()}${localWord.slice(1)} received per client`),
            dataMapping: { categoryKey: [{ id: "payments.client" }], valueKey: [paidLocal] },
          },
          payments: {
            type: "grid",
            ...title("Every payment"),
            dataMapping: {
              cols: [
                { id: "payments.paid_on" },
                { id: "payments.invoice" },
                { id: "payments.client" },
                { id: "payments.paid_usd" },
                { id: `payments.${f.rate}` },
                { id: `payments.${f.paid}` },
              ],
            },
          },
        },
        widgetLayout: {
          kpiLocal: { xTrack: 0, yTrack: 0, xSpan: 8, ySpan: 7 },
          kpiUsd: { xTrack: 8, yTrack: 0, xSpan: 8, ySpan: 7 },
          kpiDue: { xTrack: 16, yTrack: 0, xSpan: 8, ySpan: 7 },
          byMonth: { xTrack: 0, yTrack: 7, xSpan: 12, ySpan: 17 },
          byClient: { xTrack: 12, yTrack: 7, xSpan: 12, ySpan: 17 },
          payments: { xTrack: 0, yTrack: 24, xSpan: 24, ySpan: 14 },
        },
      },
    ],
    selectedPageId: "page-1",
  };
}

/**
 * AG Studio report builder over the freelancer's books. Two related sources:
 * every invoice, and every payment with its local-currency value at that
 * day's rate. Opens on a ready-made report; "Edit report" lets anyone add
 * KPIs, charts and pivots, kept in this browser.
 */
export default function StudioReports({ rows, currency }: { rows: LedgerRow[]; currency: string }) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  // v2: reports saved before the ready-made charts existed no longer hide them.
  const storageKey = `crossbill.studio.report.v2.${currency}`;
  const localWord = currency === "ZAR" ? "rand" : currency;

  const data = useMemo(() => {
    const f = fields(currency);
    const invoices = rows.map((r) => ({
      invoice: r.number ? `#${r.number}` : r.id,
      client: r.client ?? "Unknown",
      status: r.days_overdue ? "OVERDUE" : r.status,
      invoice_month: r.invoice_date?.slice(0, 7) ?? null,
      total_usd: r.total_usd ?? 0,
      due_usd: r.due_usd ?? 0,
      days_overdue: r.days_overdue ?? 0,
    }));
    const payments = rows.flatMap((r) =>
      (r.payments ?? []).map((p) => ({
        invoice: r.number ? `#${r.number}` : r.id,
        client: r.client ?? "Unknown",
        paid_on: p.paid_on,
        paid_month: p.paid_on.slice(0, 7),
        paid_usd: p.amount_usd,
        [f.rate]: p.fx_rate ?? 0,
        [f.paid]: p.amount_local ?? 0,
      })),
    );
    return {
      sources: [
        { id: "invoices", data: invoices },
        { id: "payments", data: payments },
      ],
    };
  }, [rows, currency]);

  const initialState = useMemo(() => {
    // A report this viewer edited earlier wins over the default.
    try {
      const saved = window.localStorage.getItem(storageKey);
      if (saved) return JSON.parse(saved);
    } catch {
      // Storage blocked or bad JSON: use the default report.
    }
    return defaultReport(currency, localWord);
  }, [storageKey, currency, localWord]);

  return (
    <section className="mt-4 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="on-canvas text-lg font-black">Reports</h2>
          <p className="on-canvas-muted text-xs">
            Built with AG Studio. Tap Edit report to change any chart or add your own.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              try {
                window.localStorage.removeItem(storageKey);
              } catch {
                // ignore
              }
              window.location.reload();
            }}
            className="ff-btn ff-btn-secondary ff-btn-sm"
          >
            Reset
          </button>
          <button
            onClick={() => setMode((m) => (m === "view" ? "edit" : "view"))}
            className="ff-btn ff-btn-primary ff-btn-sm"
          >
            {mode === "view" ? "Edit report" : "Done editing"}
          </button>
        </div>
      </div>
      <div className="h-[560px] w-full overflow-hidden rounded-2xl border-2 border-[var(--accent-strong)] bg-white">
        <AgStudio
          data={data}
          mode={mode}
          // No filters panel while viewing: it would only say "No filters available"
          // and covers most of the report on a phone. It stays in Edit mode.
          panels={{ view: { right: [] }, edit: { right: ["filters", "edit", "data"] } }}
          initialState={initialState as never}
          onStateUpdated={(e: { durable?: boolean; state?: unknown }) => {
            if (!e?.durable) return;
            const json = JSON.stringify(e.state);
            // In development, log the report so it can be pasted into defaultReport().
            if (process.env.NODE_ENV !== "production") console.log("[ag-studio] report state", json);
            try {
              window.localStorage.setItem(storageKey, json);
            } catch {
              // ignore
            }
          }}
        />
      </div>
    </section>
  );
}
