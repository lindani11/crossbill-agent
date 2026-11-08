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

const PLACEHOLDER = "Describe the job to invoice, or ask who owes you…";

// One example per kind of freelancer, to show Crossbill works for any field.
// Each is addressed to its own PayPal sandbox test client, so every example can
// be sent and paid end to end. If that client is not in SANDBOX_TEST_EMAILS,
// another listed test client is used instead.
const EXAMPLES: { who: string; email: string; text: (email: string) => string }[] = [
  {
    who: "Tutor",
    email: "angelina@personal.example.com",
    text: (e) => `Invoice Angelina (${e}) for 8 online maths lessons at $20 each in October`,
  },
  {
    who: "Developer",
    email: "jacksmith@personal.example.com",
    text: (e) => `Invoice Jack Smith (${e}) for 3 days of Next.js work at $250 a day plus $120 for hosting setup`,
  },
  {
    who: "Translator",
    email: "ngwenyaholdings@personal.example.com",
    text: (e) => `Invoice Ngwenya Holdings (${e}) for translating 4,500 words from English to isiZulu at $0.08 a word`,
  },
];

function exampleEmail(own: string, index: number, testEmails: string[]): string {
  if (testEmails.length === 0 || testEmails.includes(own)) return own;
  return testEmails[index % testEmails.length];
}

/** How each AI provider is named under a reply. */
const PROVIDER_NAMES: Record<string, string> = { groq: "Groq", gemini: "Gemini" };

/** Safety net in case a model still sends markdown: show clean plain text. */
function plainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[*•]\s+/gm, "- ");
}

export default function Chat({ testEmails = [] }: { testEmails?: string[] }) {
  const examples = EXAMPLES.map((ex, i) => ({
    who: ex.who,
    text: ex.text(exampleEmail(ex.email, i, testEmails)),
  }));
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Every visit or refresh opens at the top: the intro, the examples and the input.
  useEffect(() => {
    const { history } = window;
    const previous = history.scrollRestoration;
    history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    return () => {
      history.scrollRestoration = previous;
    };
  }, []);

  // Follow the conversation only once it has started.
  useEffect(() => {
    if (messages.length === 0 && !loading) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
              <p className="ff-eyebrow">Works for any freelancer · try one below</p>
              <div className="ff-options mt-3 flex flex-col gap-2">
                {examples.map((ex) => (
                  <button
                    key={ex.text}
                    onClick={() => send(ex.text)}
                    className="ff-option rounded-xl px-4 py-3 text-left text-sm text-[var(--ink)] [overflow-wrap:anywhere]"
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
              <p className="max-w-[85%] rounded-2xl rounded-br-sm [overflow-wrap:anywhere] border border-[var(--accent-strong)] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-ink)]">
                {m.content}
              </p>
            </div>
          ) : (
            <div key={i} className="max-w-full">
              <div className="ff-panel rounded-2xl rounded-bl-sm px-4 py-3">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)] [overflow-wrap:anywhere]">{m.content}</p>
                {m.proposals?.map((p, j) => <ProposalCard key={j} proposal={p} />)}
              </div>
              {m.provider ? <p className="on-canvas-muted mt-1 pl-1 text-[11px]">via {PROVIDER_NAMES[m.provider] ?? m.provider}</p> : null}
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
        <div className="relative min-w-0 flex-1">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            aria-label={PLACEHOLDER}
            className="ff-input w-full text-sm"
          />
          {/* Placeholder that scrolls sideways on narrow screens so it can be read in full. */}
          {input ? null : (
            <span aria-hidden="true" className="ff-placeholder text-sm">
              <span className="ff-marquee">
                <span>{PLACEHOLDER}</span>
                <span className="ff-marquee-copy">{PLACEHOLDER}</span>
              </span>
            </span>
          )}
        </div>
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
