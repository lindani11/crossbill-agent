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
];

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
        { role: "assistant", content: json.text, proposals: json.proposals, provider: json.provider },
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
          <div className="rounded-xl border border-dashed border-[var(--line)] p-4">
            <p className="text-sm font-medium">Works for any freelancer. Try one:</p>
            <div className="mt-3 flex flex-col gap-2">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex.text}
                  onClick={() => send(ex.text)}
                  className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-left text-sm hover:border-[var(--accent)]"
                >
                  <span className="mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                    {ex.who}
                  </span>
                  {ex.text}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl rounded-br-sm bg-[var(--accent)] px-4 py-2 text-sm text-[var(--accent-ink)]">
                {m.content}
              </p>
            </div>
          ) : (
            <div key={i} className="max-w-full">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
              {m.proposals?.map((p, j) => <ProposalCard key={j} proposal={p} />)}
              {m.provider ? (
                <p className="mt-1 text-[11px] text-[var(--muted)]">via {m.provider}</p>
              ) : null}
            </div>
          ),
        )}

        {loading ? <p className="text-sm text-[var(--muted)]">Thinking…</p> : null}
        {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="sticky bottom-0 flex gap-2 bg-[var(--bg)] pt-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Describe the job to invoice, or ask who owes you…"
          className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-[var(--accent-ink)] disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
