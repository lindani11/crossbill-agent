"use client";

import { useRef, useState } from "react";
import { formatUsd, type Proposal } from "@/lib/schemas";

type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; detail: string; link?: string }
  | { status: "error"; message: string }
  | { status: "discarded" };

const TERM_LABEL: Record<string, string> = {
  DUE_ON_RECEIPT: "Due on receipt",
  NET_10: "Due in 10 days",
  NET_15: "Due in 15 days",
  NET_30: "Due in 30 days",
};

export default function ProposalCard({ proposal }: { proposal: Proposal }) {
  const [state, setState] = useState<SendState>({ status: "idle" });
  // One id per card: retries and double taps reuse it, so PayPal never
  // creates the same invoice twice.
  const requestId = useRef<string>(crypto.randomUUID());

  async function approve() {
    setState({ status: "sending" });
    try {
      const res =
        proposal.kind === "invoice"
          ? await fetch("/api/invoices/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ proposal: proposal.data, requestId: requestId.current }),
            })
          : await fetch("/api/invoices/remind", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(proposal.data),
            });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");

      if (proposal.kind === "invoice") {
        setState({
          status: "sent",
          detail: `Invoice ${json.invoice.number ?? ""} sent to ${proposal.data.client_email}. Status: ${json.invoice.status}.`,
          link: json.payerUrl,
        });
      } else {
        setState({ status: "sent", detail: "Reminder sent." });
      }
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "Something went wrong" });
    }
  }

  const busy = state.status === "sending";
  const done = state.status === "sent" || state.status === "discarded";

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-sm">
      {proposal.kind === "invoice" ? (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Invoice draft</p>
              <p className="mt-1 font-semibold">{proposal.data.client_name}</p>
              <p className="text-sm text-[var(--muted)]">{proposal.data.client_email}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-semibold tabular-nums">{formatUsd(proposal.total)}</p>
              <p className="text-xs text-[var(--muted)]">
                {TERM_LABEL[proposal.data.payment_term ?? ""] ?? "Default terms"}
              </p>
            </div>
          </div>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {proposal.data.items.map((it, i) => (
                <tr key={i} className="border-t border-[var(--line)]">
                  <td className="py-2 pr-2">
                    <span className="font-medium">{it.name}</span>
                    {it.description ? <span className="block text-xs text-[var(--muted)]">{it.description}</span> : null}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-[var(--muted)]">
                    {it.quantity} × {formatUsd(it.unit_amount)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatUsd(it.quantity * it.unit_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {proposal.data.note ? <p className="mt-2 text-sm text-[var(--muted)]">Note: {proposal.data.note}</p> : null}
        </>
      ) : (
        <>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Reminder draft{proposal.data.invoice_number ? ` · invoice ${proposal.data.invoice_number}` : ""}
          </p>
          <p className="mt-1 font-semibold">{proposal.data.subject}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{proposal.data.note}</p>
        </>
      )}

      {state.status === "sent" ? (
        <p className="mt-3 text-sm font-medium text-[var(--accent)]">
          {state.detail}{" "}
          {state.link ? (
            <a href={state.link} target="_blank" rel="noreferrer" className="underline">
              Open the client&apos;s payment page
            </a>
          ) : null}
        </p>
      ) : null}
      {state.status === "error" ? <p className="mt-3 text-sm text-[var(--danger)]">{state.message}</p> : null}
      {state.status === "discarded" ? <p className="mt-3 text-sm text-[var(--muted)]">Discarded. Nothing was sent.</p> : null}

      {!done ? (
        <div className="mt-4 flex gap-2">
          <button
            onClick={approve}
            disabled={busy}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-ink)] disabled:opacity-60"
          >
            {busy ? "Sending…" : state.status === "error" ? "Try again" : "Approve & send"}
          </button>
          <button
            onClick={() => setState({ status: "discarded" })}
            disabled={busy}
            className="rounded-lg border border-[var(--line)] px-4 py-2 text-sm disabled:opacity-60"
          >
            Discard
          </button>
        </div>
      ) : null}
    </div>
  );
}
