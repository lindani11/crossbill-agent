"use client";

import { useEffect, useId, useRef, useState } from "react";
import ProposalCard from "./proposal-card";
import type { Proposal } from "@/lib/schemas";
import { buildExamples, type Example } from "@/lib/examples";

type Message = {
  role: "user" | "assistant";
  content: string;
  proposals?: Proposal[];
  suggestions?: Example[];
  provider?: string;
};

const PLACEHOLDER = "Describe the job to invoice, or ask who owes you…";

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
  const examples = buildExamples(testEmails);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  // The input grows with its text, line by line, up to about 8 lines; then it scrolls.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const borders = el.offsetHeight - el.clientHeight;
    const max = 8 * 24 + 24 + borders; // 8 lines of 24px + padding + borders
    el.style.height = `${Math.min(el.scrollHeight + borders, max)}px`;
  }, [input]);

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
        {
          role: "assistant",
          content: plainText(json.text),
          proposals: json.proposals,
          suggestions: json.suggestions,
          provider: json.provider,
        },
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
              <ExampleList examples={examples} onPick={send} />
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
                {m.suggestions?.length ? (
                  <ExampleDropdown examples={m.suggestions} onPick={send} disabled={loading} />
                ) : null}
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
        className="sticky bottom-0 -mx-2 flex items-end gap-2 rounded-t-2xl bg-[rgb(35_20_10/0.6)] px-2 pt-3 pb-2"
      >
        <div className="relative min-w-0 flex-1">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds a line; Ctrl+Enter (Cmd+Enter on a Mac) sends.
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send(input);
              }
            }}
            aria-label={PLACEHOLDER}
            aria-keyshortcuts="Control+Enter Meta+Enter"
            className="ff-input block w-full resize-none overflow-y-auto text-sm leading-6"
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

/** Example prompts as tappable cards; tapping one sends it. */
function ExampleList({
  examples,
  onPick,
  disabled = false,
}: {
  examples: Example[];
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="ff-options mt-3 flex flex-col gap-2">
      {examples.map((ex) => (
        <button
          key={ex.text}
          type="button"
          disabled={disabled}
          onClick={() => onPick(ex.text)}
          className="ff-option rounded-xl px-4 py-3 text-left text-sm text-[var(--ink)] [overflow-wrap:anywhere] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="mb-0.5 block text-[11px] font-black uppercase tracking-[0.12em] text-[var(--accent-strong)]">
            {ex.who}
          </span>
          {ex.text}
        </button>
      ))}
    </div>
  );
}

/** Examples inside a reply: closed by default, they slide open from a small button. */
function ExampleDropdown({
  examples,
  onPick,
  disabled,
}: {
  examples: Example[];
  onPick: (text: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="mt-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="ff-btn ff-btn-secondary ff-btn-sm"
      >
        {open ? "Hide examples" : `Try an example (${examples.length})`}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className={`ff-chevron h-3.5 w-3.5${open ? " ff-chevron-open" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </button>
      <div id={id} className="ff-collapse" data-open={open} inert={!open}>
        <div className="ff-collapse-inner">
          <ExampleList examples={examples} onPick={onPick} disabled={disabled} />
        </div>
      </div>
    </div>
  );
}
