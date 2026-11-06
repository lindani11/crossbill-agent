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
  loading: () => <p className="text-sm text-[var(--muted)]">Loading reports…</p>,
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

// Matches the app's colours in light and dark mode.
const theme = themeQuartz.withParams({
  backgroundColor: "var(--surface)",
  foregroundColor: "var(--ink)",
  headerBackgroundColor: "var(--bg)",
  borderColor: "var(--line)",
  accentColor: "var(--accent)",
  fontFamily: "inherit",
  fontSize: 13,
  wrapperBorderRadius: 12,
});

const STATUS_STYLE: Record<string, string> = {
  PAID: "bg-[var(--accent)] text-[var(--accent-ink)]",
  MARKED_AS_PAID: "bg-[var(--accent)] text-[var(--accent-ink)]",
  PARTIALLY_PAID: "border border-[var(--accent)] text-[var(--accent)]",
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
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${overdue ?? STATUS_STYLE[row.status] ?? "text-[var(--muted)]"}`}
    >
      {label}
    </span>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "accent" | "danger" }) {
  const color = tone === "accent" ? "text-[var(--accent)]" : tone === "danger" ? "text-[var(--danger)]" : "";
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
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
        <Tile label="Outstanding" value={sum ? formatMoney(sum.outstanding_usd, "USD") : "—"} sub="Sent, not yet paid" />
        <Tile
          label="Overdue"
          value={sum ? formatMoney(sum.overdue_usd, "USD") : "—"}
          sub={sum ? `${sum.overdue_count} invoice${sum.overdue_count === 1 ? "" : "s"}` : undefined}
          tone={sum && sum.overdue_count > 0 ? "danger" : undefined}
        />
        <Tile
          label="Received"
          value={sum ? formatMoney(sum.paid_usd, "USD") : "—"}
          sub={sum ? `${sum.paid_count} payment${sum.paid_count === 1 ? "" : "s"}` : undefined}
        />
        <Tile
          label={`Received in ${localWord}`}
          value={sum ? formatMoney(sum.paid_local, currency) : "—"}
          sub="At each payment day's rate"
          tone="accent"
        />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Invoices</h2>
        <div className="flex items-center gap-2">
          <Link
            href="/statement"
            className="rounded-lg px-3 py-1.5 text-sm text-[var(--accent)] hover:underline"
          >
            Tax statement →
          </Link>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border border-[var(--line)] px-3 py-1.5 text-sm disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh from PayPal"}
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}

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

      <p className="text-xs text-[var(--muted)]">
        Live from PayPal. {currency} values use the exchange rate for each payment date (European Central Bank
        reference rates via Frankfurter).
      </p>

      {rows && rows.length > 0 ? <StudioReports rows={rows} currency={currency} /> : null}
    </div>
  );
}
