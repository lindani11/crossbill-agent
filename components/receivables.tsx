"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  ModuleRegistry,
  themeQuartz,
  type ColDef,
  type ICellRendererParams,
  type ValueFormatterParams,
} from "ag-grid-community";
import { formatDate, formatMoney } from "@/lib/money";

ModuleRegistry.registerModules([AllCommunityModule]);

// AG Studio runs in the browser only.
const StudioReports = dynamic(() => import("./studio-reports"), {
  ssr: false,
  loading: () => (
    <div aria-busy="true" aria-label="Loading reports" className="ff-panel flex h-[560px] flex-col gap-4 rounded-2xl p-5">
      <div className="ff-skeleton h-4 w-40" />
      <div className="grid flex-1 gap-4 sm:grid-cols-2">
        <div className="ff-skeleton-soft h-full" />
        <div className="ff-skeleton-soft h-full" />
      </div>
    </div>
  ),
});

type Row = {
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
  paid_on: string | null;
  fx_rate: number | null;
  fx_date: string | null;
  paid_local: number | null;
  days_overdue: number | null;
  payments: {
    invoice_number: string | null;
    client: string | null;
    paid_on: string;
    amount_usd: number;
    fx_rate: number | null;
    fx_date: string | null;
    amount_local: number | null;
  }[];
};

type Totals = {
  outstanding_usd: number;
  overdue_usd: number;
  overdue_count: number;
  paid_usd: number;
  paid_local: number;
  paid_count: number;
};

const money = (currency: string) => (p: ValueFormatterParams) =>
  p.value === null || p.value === undefined ? "" : formatMoney(p.value as number, currency);
const date = (p: ValueFormatterParams) => formatDate(p.value as string | null);

// White panel with deep-blue edges, matching the rest of the app.
const theme = themeQuartz.withParams({
  backgroundColor: "rgb(247 240 228)",
  foregroundColor: "var(--ink)",
  headerBackgroundColor: "var(--bg)",
  headerTextColor: "var(--ink)",
  headerFontWeight: 800,
  borderColor: "var(--line-soft)",
  wrapperBorder: { color: "var(--accent-strong)", width: 2 },
  accentColor: "var(--accent-strong)",
  rowHoverColor: "rgb(125 211 252 / 0.18)",
  oddRowBackgroundColor: "rgb(240 232 218)",
  fontFamily: "inherit",
  fontSize: 13,
  wrapperBorderRadius: 16,
});

const STATUS_STYLE: Record<string, string> = {
  PAID: "bg-[var(--accent)] text-[var(--accent-ink)]",
  MARKED_AS_PAID: "bg-[var(--accent)] text-[var(--accent-ink)]",
  PARTIALLY_PAID: "border border-[var(--accent-strong)] text-[var(--accent-strong)]",
  SENT: "border border-[var(--line)] text-[var(--ink)]",
  UNPAID: "border border-[var(--line)] text-[var(--ink)]",
  CANCELLED: "text-[var(--muted)] line-through",
};

function StatusChip(p: ICellRendererParams<Row>) {
  const row = p.data;
  if (!row) return null;
  const overdue = row.days_overdue ? "border border-[var(--danger)] text-[var(--danger)]" : null;
  const label = row.days_overdue ? "OVERDUE" : row.status.replace(/_/g, " ");
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-extrabold ${overdue ?? STATUS_STYLE[row.status] ?? "text-[var(--muted)]"}`}
    >
      {label}
    </span>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string | null; sub?: string; tone?: "accent" | "danger" }) {
  const color = tone === "accent" ? "text-[var(--accent-strong)]" : tone === "danger" ? "text-[var(--danger)]" : "";
  return (
    <div className={`${tone === "accent" ? "ff-panel-strong" : "ff-panel"} min-w-0 rounded-2xl p-3.5 sm:p-4`}>
      <p className="ff-eyebrow !tracking-[0.12em]">{label}</p>
      {value === null ? (
        <div className="ff-skeleton mt-2 h-7 w-full max-w-28" aria-hidden="true" />
      ) : (
        // Scales down on small phones so large rand amounts stay inside the tile.
        <p className={`mt-1 text-[clamp(1rem,5.2vw,1.5rem)] font-black tabular-nums [overflow-wrap:anywhere] sm:text-2xl ${color}`}>
          {value}
        </p>
      )}
      {sub ? <p className="mt-0.5 text-xs text-[var(--muted)]">{sub}</p> : null}
    </div>
  );
}

export default function Receivables() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [currency, setCurrency] = useState("ZAR");
  const [sum, setSum] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ledger", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load invoices");
      setRows(json.rows);
      setSum(json.totals);
      if (json.currency) setCurrency(json.currency);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const columns = useMemo<ColDef<Row>[]>(
    () => [
      // Min widths let the columns fit a desktop screen; on a phone the middle
      // scrolls while the local-currency column stays pinned on the right.
      // Filters only where they help (client, status); a filter button on every
      // column took ~30px each and squeezed the headers.
      { field: "number", headerName: "Invoice", minWidth: 85, filter: false, valueFormatter: (p) => (p.value ? `#${p.value}` : "") },
      { field: "client", headerName: "Client", minWidth: 130, tooltipField: "client" },
      { field: "status", headerName: "Status", minWidth: 110, cellRenderer: StatusChip },
      { field: "total_usd", headerName: "Total (USD)", minWidth: 90, filter: false, type: "rightAligned", valueFormatter: money("USD") },
      { field: "due_usd", headerName: "Due (USD)", minWidth: 85, filter: false, type: "rightAligned", valueFormatter: money("USD") },
      { field: "due_date", headerName: "Due date", minWidth: 105, filter: false, valueFormatter: date },
      {
        field: "days_overdue",
        headerName: "Overdue",
        headerTooltip: "Days overdue",
        minWidth: 90,
        filter: false,
        type: "rightAligned",
        valueFormatter: (p) => (p.value ? `${p.value} d` : ""),
      },
      { field: "paid_on", headerName: "Paid on", minWidth: 105, filter: false, valueFormatter: date },
      { field: "paid_usd", headerName: "Paid (USD)", minWidth: 90, filter: false, type: "rightAligned", valueFormatter: money("USD") },
      {
        field: "fx_rate",
        headerName: `USD/${currency}`,
        minWidth: 95,
        filter: false,
        type: "rightAligned",
        valueFormatter: (p) => (p.value ? (p.value as number).toFixed(4) : ""),
        headerTooltip: "Exchange rate for the payment date (European Central Bank reference rate)",
      },
      {
        field: "paid_local",
        headerName: `Paid (${currency})`,
        width: 130,
        pinned: "right",
        suppressSizeToFit: true,
        filter: false,
        type: "rightAligned",
        valueFormatter: money(currency),
        cellClass: "font-semibold",
      },
    ],
    [currency],
  );
  // Hovering a header shows its full name.
  const columnDefs = useMemo(() => columns.map((c) => ({ headerTooltip: c.headerName, ...c })), [columns]);

  const localWord = currency === "ZAR" ? "rand" : currency;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Outstanding" value={sum ? formatMoney(sum.outstanding_usd, "USD") : error ? "—" : null} sub="Sent, not yet paid" />
        <Tile
          label="Overdue"
          value={sum ? formatMoney(sum.overdue_usd, "USD") : error ? "—" : null}
          sub={sum ? `${sum.overdue_count} invoice${sum.overdue_count === 1 ? "" : "s"}` : undefined}
          tone={sum && sum.overdue_count > 0 ? "danger" : undefined}
        />
        <Tile
          label="Received"
          value={sum ? formatMoney(sum.paid_usd, "USD") : error ? "—" : null}
          sub={sum ? `${sum.paid_count} payment${sum.paid_count === 1 ? "" : "s"}` : undefined}
        />
        <Tile
          label={`Received in ${localWord}`}
          value={sum ? formatMoney(sum.paid_local, currency) : error ? "—" : null}
          sub="At each payment day's rate"
          tone="accent"
        />
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="on-canvas text-lg font-black">Invoices</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/statement" className="ff-btn ff-btn-secondary ff-btn-sm">
            Tax statement ↗
          </Link>
          <button onClick={load} disabled={loading} aria-busy={loading} className="ff-btn ff-btn-primary ff-btn-sm">
            {loading ? <span aria-hidden="true" className="ff-spinner" /> : null}
            {loading ? "Refreshing…" : "Refresh from PayPal"}
          </button>
        </div>
      </div>

      {error ? (
        <p role="alert" className="ff-panel rounded-xl px-4 py-3 text-sm font-semibold text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <div className="h-[520px] w-full">
        <AgGridReact<Row>
          theme={theme}
          rowData={rows ?? undefined}
          columnDefs={columnDefs}
          defaultColDef={{
            sortable: true,
            filter: true,
            resizable: true,
            // Long header names wrap onto two lines instead of being cut off.
            wrapHeaderText: true,
            autoHeaderHeight: true,
          }}
          tooltipShowDelay={300}
          autoSizeStrategy={{ type: "fitGridWidth" }}
          onGridSizeChanged={(e) => e.api.sizeColumnsToFit()}
          loading={rows === null && !error}
          overlayNoRowsTemplate="No invoices yet. Create one in Chat."
          getRowId={(p) => p.data.id}
        />
      </div>

      <p className="on-canvas-muted text-xs">
        Live from PayPal. {currency} values use the exchange rate for each payment date (European Central Bank
        reference rates via Frankfurter).
      </p>

      {rows && rows.length > 0 ? <StudioReports rows={rows} currency={currency} /> : null}
    </div>
  );
}
