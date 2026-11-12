"use client";

import { useRef, useState } from "react";
import type { Proposal } from "@/lib/schemas";
import { describeQuantity, formatMoney } from "@/lib/money";

/**
 * components/proposal-card.tsx · A draft invoice or reminder, waiting for approval
 *
 * This card is the human-in-the-loop step: nothing reaches PayPal until the
 * freelancer taps Approve & send.
 *
 *   Approve & send → POST /api/invoices/send   (the invoice and its requestId)
 *                  → POST /api/invoices/remind (the reminder)
 *     ← sent: the invoice number, its status and the client's payment page
 *     ← error: the message, and the button turns into "Try again"
 *   Discard → nothing is sent
 */

// The card's states. Each member of the union carries only its own data.
type SendState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; detail: string; link?: string }
  | { status: "error"; message: string }
  | { status: "discarded" };

// PayPal's term codes in plain words.
const TERM_LABEL: Record<string, string> = {
  DUE_ON_RECEIPT: "Due on receipt",
  NET_10: "Due in 10 days",
  NET_15: "Due in 15 days",
  NET_30: "Due in 30 days",
};

export default function ProposalCard({ proposal }: { proposal: Proposal }) {
  const [state, setState] = useState<SendState>({ status: "idle" });
  // One id per card, kept by useRef across re-renders: retries and double taps
  // reuse it, so PayPal never creates the same invoice twice.
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

  // While sending, both buttons are disabled: a second guard against double taps.
  const busy = state.status === "sending";
  const done = state.status === "sent" || state.status === "discarded";

  return (
    <div className="mt-3 rounded-2xl border border-[var(--accent-strong)] bg-[var(--surface-strong)] p-4 sm:p-5">
      {proposal.kind === "invoice" ? (
        <>
          {/* On narrow phones the total drops below the client instead of being pushed off the card. */}
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div className="min-w-0 flex-1 basis-48">
              <p className="ff-eyebrow">Invoice draft</p>
              <p className="mt-1 font-extrabold [overflow-wrap:anywhere]">{proposal.data.client_name}</p>
              <p className="text-sm text-[var(--muted)] [overflow-wrap:anywhere]">{proposal.data.client_email}</p>
            </div>
            <div className="shrink-0 sm:text-right">
              <p className="text-2xl font-black tabular-nums">{formatMoney(proposal.total, "USD")}</p>
              <p className="text-xs text-[var(--muted)]">
                {TERM_LABEL[proposal.data.payment_term ?? ""] ?? "Default terms"}
              </p>
            </div>
          </div>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {proposal.data.items.map((it, i) => (
                <tr key={i} className="border-t border-[var(--line-soft)]">
                  <td className="py-2 pr-2 [overflow-wrap:anywhere]">
                    <span className="font-medium">{it.name}</span>
                    {it.description ? <span className="block text-xs text-[var(--muted)]">{it.description}</span> : null}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums text-[var(--muted)]">
                    {describeQuantity(it)}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatMoney(it.quantity * it.unit_amount, "USD")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {proposal.data.note ? <p className="mt-2 text-sm text-[var(--muted)]">Note: {proposal.data.note}</p> : null}
        </>
      ) : (
        <>
          <p className="ff-eyebrow">
            Reminder draft{proposal.data.invoice_number ? ` · invoice ${proposal.data.invoice_number}` : ""}
          </p>
          <p className="mt-1 font-extrabold">{proposal.data.subject}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm">{proposal.data.note}</p>
        </>
      )}

      {state.status === "sent" ? (
        <p role="status" className="mt-3 rounded-xl border border-[var(--success)] bg-[rgb(236_253_245)] px-3 py-2 text-sm font-semibold text-[var(--success)]">
          {state.detail}{" "}
          {state.link ? (
            <a href={state.link} target="_blank" rel="noopener noreferrer" className="font-extrabold text-[var(--accent-strong)] underline underline-offset-2">
              Open the client&apos;s payment page
              <span className="sr-only"> (opens in a new tab)</span>
            </a>
          ) : null}
        </p>
      ) : null}
      {state.status === "error" ? <p role="alert" className="mt-3 text-sm font-semibold text-[var(--danger)]">{state.message}</p> : null}
      {state.status === "discarded" ? <p className="mt-3 text-sm text-[var(--muted)]">Discarded. Nothing was sent.</p> : null}

      {!done ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={approve} disabled={busy} aria-busy={busy} className="ff-btn ff-btn-primary">
            {busy ? <span aria-hidden="true" className="ff-spinner" /> : null}
            {busy ? "Sending…" : state.status === "error" ? "Try again" : "Approve & send"}
          </button>
          <button onClick={() => setState({ status: "discarded" })} disabled={busy} className="ff-btn ff-btn-secondary">
            Discard
          </button>
        </div>
      ) : null}
    </div>
  );
}
