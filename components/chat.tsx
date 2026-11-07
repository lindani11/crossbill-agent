"use client";

import { useEffect, useRef, useState } from "react";
import ProposalCard from "./proposal-card";
import type { Proposal } from "@/lib/schemas";

type Message = {
  role: "user" | "assistant";
  content: string;
  proposals?: Proposal[];
  provider?: string;
};

// One example per kind of freelancer, to show Crossbill works for any field.
const EXAMPLES = [
  { who: "Tutor", text: "Invoice Emma Brown (emma.brown@example.com) for 8 online maths lessons at $20 each in October" },
  { who: "Translator", text: "Bill Acme Ltd (accounts@acme.example.com) for translating 4,500 words from English to isiZulu at $0.08 a word" },
  { who: "Designer", text: "Invoice Bloom Café (hello@bloomcafe.example.com) a flat $450 for a logo and brand kit, due on receipt" },
  { who: "Developer", text: "Invoice Sarah Lee (sarah@example.com) for 3 days of Next.js work at $250 a day plus $120 for hosting setup" },
  { who: "Virtual assistant", text: "Invoice James Cole (james@example.com) for 20 hours of admin support at $12 an hour" },
  { who: "Any freelancer", text: "Who owes me money right now?" },
  { who: "Tax time", text: "How much did I earn this tax year, in rand?" },
];

/** Safety net in case a model still sends markdown: show clean plain text. */
function plainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[*•]\s+/gm, "- ");
}

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || loading) return;
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
    setInput("");
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Only the last 20 messages, as plain text, go to the server.
        body: JSON.stringify({ messages: next.slice(-20).map(({ role, content }) => ({ role, content })) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Something went wrong");
      setMessages([
        ...next,
        { role: "assistant", content: plainText(json.text), proposals: json.proposals, provider: json.provider },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col pb-4">
      <div className="flex-1 space-y-4 py-2">
        {messages.length === 0 ? (
          <>
            <div>
              <p className="ff-eyebrow">AI invoicing agent</p>
              <h1 className="on-canvas mt-1 text-3xl font-black tracking-tight">Describe the job. Approve. Get paid.</h1>
              <p className="on-canvas-muted mt-2 text-sm leading-6">
                Crossbill drafts a real PayPal invoice, sends it only when you approve, chases late payers and keeps
                your books in rand.
              </p>
            </div>
            <div className="ff-panel-strong rounded-2xl p-4 sm:p-5">
              <p className="ff-eyebrow">Works for any freelancer · try one</p>
              <div className="mt-3 flex flex-col gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.text}
                    onClick={() => send(ex.text)}
                    className="ff-option rounded-xl px-4 py-3 text-left text-sm text-[var(--ink)]"
                  >
                    <span className="mb-0.5 block text-[11px] font-black uppercase tracking-[0.12em] text-[var(--accent-strong)]">
                      {ex.who}
                    </span>
                    {ex.text}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : null}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm border border-[var(--accent-strong)] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-ink)]">
                {m.content}
              </p>
            </div>
          ) : (
            <div key={i} className="max-w-full">
              <div className="ff-panel rounded-2xl rounded-bl-sm px-4 py-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)]">{m.content}</p>
                {m.proposals?.map((p, j) => <ProposalCard key={j} proposal={p} />)}
              </div>
              {m.provider ? <p className="on-canvas-muted mt-1 pl-1 text-[11px]">via {m.provider}</p> : null}
            </div>
          ),
        )}

        {loading ? (
          <p role="status" className="ff-panel inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-[var(--muted)]">
            <span aria-hidden="true" className="ff-spinner" />
            Thinking…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="ff-panel rounded-xl border-[var(--danger)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-0 -mx-2 flex gap-2 rounded-t-2xl bg-[rgb(35_20_10/0.6)] px-2 pt-3 pb-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe the job to invoice, or ask who owes you…"
          className="ff-input min-w-0 flex-1 text-sm"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="ff-btn ff-btn-primary min-h-12"
        >
          {loading ? <span aria-hidden="true" className="ff-spinner" /> : null}
          Send
        </button>
      </form>
    </div>
  );
}
