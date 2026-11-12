"use client";

import { useEffect, useId, useRef, useState } from "react";
import ProposalCard from "./proposal-card";
import type { Proposal } from "@/lib/schemas";
import { buildExamples, type Example } from "@/lib/examples";

/**
 * components/chat.tsx · The chat: messages, example prompts and the input
 *
 * A Client Component ("use client"): the conversation lives in React state in
 * this tab only. Nothing is stored; a refresh starts a new chat.
 *
 * A phone-first chat: the examples wait on the right as your own bubbles,
 * ready to send; Crossbill answers on the left; a small floating Help bubble
 * under the header brings up the intro as a reply from Crossbill.
 *
 * How it connects
 *   app/page.tsx → <Chat testEmails> → buildExamples() → the example bubbles
 *   send() → POST /api/chat (the last 20 messages) → lib/agent.ts runAgent()
 *     ← { text, proposals, suggestions, provider }
 *        proposals   → <ProposalCard> with Approve & send
 *        suggestions → <ExampleDropdown>
 *
 * Accessibility: the message list is a live region (role="log"), so screen
 * readers announce each reply; Enter sends and Shift+Enter adds a line.
 */

// One chat bubble. A reply from Crossbill can carry draft cards and example buttons.
type Message = {
  role: "user" | "assistant";
  content: string;
  proposals?: Proposal[];
  suggestions?: Example[];
  provider?: string;
};

// Also the input's accessible name (aria-label), so it is never only a visual hint.
const PLACEHOLDER = "Describe the job to invoice, or ask who owes you…";

/** How long bubbles take to fade out; matches .ff-leaving in app/globals.css. */
const LEAVE_MS = 200;

/** True when the device asks for less motion: bubbles then appear and go at once. */
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** How each AI provider is named under a reply. */
const PROVIDER_NAMES: Record<string, string> = { groq: "Groq", "groq-small": "Groq (small model)", gemini: "Gemini" };

/** Safety net in case a model still sends markdown: show clean plain text. */
function plainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[*•]\s+/gm, "- ");
}

/** testEmails come from the server (app/page.tsx), for the example prompts. */
export default function Chat({ testEmails = [] }: { testEmails?: string[] }) {
  const examples = buildExamples(testEmails);
  // The whole conversation is React state; refreshing the page starts afresh.
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The Help reply: shown at the end of the conversation, never sent to the server.
  const [helpOpen, setHelpOpen] = useState(false);
  // Bubbles on their way out: the examples and Help as you send, or Help as it closes.
  const [leaving, setLeaving] = useState(false);
  const [helpClosing, setHelpClosing] = useState(false);
  const helpId = useId();
  const helpRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Every visit or refresh opens at the top: Help, the examples and the input.
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

  // Bring the Help reply into view when it opens.
  useEffect(() => {
    if (!helpOpen) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    helpRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }, [helpOpen]);

  // Follow the conversation only once it has started.
  useEffect(() => {
    if (messages.length === 0 && !loading) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    endRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  }, [messages, loading]);

  // Adds the freelancer's message, asks the agent, then adds its reply (or an error).
  async function send(text: string) {
    const content = text.trim();
    if (!content || loading || leaving) return;
    setInput("");
    setError(null);
    // First the example bubbles (and an open Help reply) fade out.
    if ((messages.length === 0 || helpOpen) && !reduceMotion()) {
      setLeaving(true);
      await new Promise((resolve) => setTimeout(resolve, LEAVE_MS));
      setLeaving(false);
    }
    setHelpOpen(false);
    // Then the message shows (an optimistic update), before the reply arrives.
    const next: Message[] = [...messages, { role: "user", content }];
    setMessages(next);
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

  // Help opens at once and fades out as it closes.
  function toggleHelp() {
    if (helpClosing) return;
    if (!helpOpen || reduceMotion()) {
      setHelpOpen(!helpOpen);
      return;
    }
    setHelpClosing(true);
    setTimeout(() => {
      setHelpOpen(false);
      setHelpClosing(false);
    }, LEAVE_MS);
  }

  return (
    <div className="flex flex-1 flex-col pb-4">
      {/* The page heading, for screen readers; the intro now lives in the Help reply. */}
      <h1 className="sr-only">Chat with Crossbill</h1>

      {/* Help: pinned under the header on the right and floating gently. The row
          lets taps through to the chat scrolling under it; only the button takes them. */}
      <div className="pointer-events-none sticky top-14 z-20 flex justify-end sm:top-16">
        <button
          type="button"
          aria-expanded={helpOpen}
          aria-controls={helpOpen ? helpId : undefined}
          onClick={toggleHelp}
          className="ff-help pointer-events-auto"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-4 w-4">
            <circle cx="10" cy="10" r="8.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M7.75 7.6a2.3 2.3 0 0 1 4.5.6c0 1.5-2.25 1.9-2.25 3.3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="10" cy="14.4" r="0.95" fill="currentColor" />
          </svg>
          Help
        </button>
      </div>

      <div role="log" aria-live="polite" aria-label="Conversation" className="flex-1 space-y-4 py-2">
        {/* Empty chat: the four examples, waiting on the right as your own messages. */}
        {messages.length === 0 ? (
          <div className={leaving ? "ff-leaving" : undefined}>
            <ExampleList examples={examples} onPick={send} />
          </div>
        ) : null}

        {/* The conversation: the freelancer on the right, Crossbill on the left with any cards.
            New bubbles animate in once (yours slide up, Crossbill's pop); keys keep old ones still. */}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="flex justify-end">
              <p className="ff-bubble-in relative max-w-[85%] rounded-2xl rounded-br-none [overflow-wrap:anywhere] border border-[var(--accent-strong)] bg-[var(--accent)] px-4 py-2.5 text-sm font-medium text-[var(--accent-ink)] [--tail-fill:var(--accent)] [--tail-stroke:var(--accent-strong)]">
                {m.content}
                <Tail side="right" />
              </p>
            </div>
          ) : (
            <div key={i} className="max-w-full">
              <div className="ff-panel ff-bubble-pop relative rounded-2xl rounded-bl-none px-4 py-3 [--tail-fill:var(--surface)] [--tail-stroke:var(--line)]">
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--ink)] [overflow-wrap:anywhere]">{m.content}</p>
                {m.proposals?.map((p, j) => <ProposalCard key={j} proposal={p} />)}
                {m.suggestions?.length ? (
                  <ExampleDropdown examples={m.suggestions} onPick={send} disabled={loading} />
                ) : null}
                <Tail side="left" />
              </div>
              {m.provider ? <p className="on-canvas-muted ff-fade-in mt-1 pl-1 text-[11px]">via {PROVIDER_NAMES[m.provider] ?? m.provider}</p> : null}
            </div>
          ),
        )}

        {/* The Help reply: what used to be the intro, as a message from Crossbill. */}
        {helpOpen ? (
          <div
            id={helpId}
            ref={helpRef}
            className={`ff-panel relative max-w-[85%] rounded-2xl rounded-bl-none px-4 py-3 text-sm [--tail-fill:var(--surface)] [--tail-stroke:var(--line)] ${leaving || helpClosing ? "ff-leaving" : "ff-bubble-pop"}`}
          >
            <p className="ff-eyebrow">AI invoicing agent</p>
            <p className="mt-1 text-base font-black tracking-tight text-[var(--ink)]">Describe the job. Approve. Get paid.</p>
            <p className="mt-1 leading-relaxed text-[var(--muted)]">
              Crossbill drafts a real PayPal invoice, sends it only when you approve, chases late payers and keeps your
              books in rand.
            </p>
            <p className="mt-2 leading-relaxed text-[var(--muted)]">
              It works for any freelancer. The examples show a tutor, a developer and a translator invoicing a client,
              and a question any freelancer asks. Tap one to send it, or type your own below.
            </p>
            <Tail side="left" />
          </div>
        ) : null}

        {/* role="status" announces "Thinking…" politely; role="alert" (below) at once. */}
        {loading ? (
          <p role="status" className="ff-panel ff-fade-in inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-[var(--muted)]">
            <span aria-hidden="true" className="ff-spinner" />
            Thinking…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="ff-panel ff-fade-in rounded-xl border-[var(--danger)] px-4 py-3 text-sm font-semibold text-[var(--danger)]">
            {error}
          </p>
        ) : null}
        {/* Scroll target; the margin keeps the last card clear of the sticky input. */}
        <div ref={endRef} className="scroll-mb-32" />
      </div>

      {/* Sticky at the bottom, so the input stays within reach on a phone. */}
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
              // Enter sends; Shift+Enter adds a line. Not while an IME is composing (e.g. Japanese input).
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send(input);
              }
            }}
            aria-label={PLACEHOLDER}
            aria-keyshortcuts="Enter"
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

/**
 * The small tail that turns a box into a chat bubble, on its square bottom
 * corner. Colours come from --tail-fill and --tail-stroke. glow adds a layer
 * that lights up with an example bubble's glow.
 */
function Tail({ side, glow = false }: { side: "left" | "right"; glow?: boolean }) {
  const right = side === "right";
  // The fill (and its glow) reaches 1px into the bubble to hide its straight edge under the curve.
  const fill = right ? "M-1 0H0.5C0.5 6 3 10 9.5 11.5H-1Z" : "M11 0H9.5C9.5 6 7 10 0.5 11.5H11Z";
  // The edge is open where it meets the bubble, so it continues the bubble's border.
  const edge = right ? "M0.5 0C0.5 6 3 10 9.5 11.5H-1" : "M9.5 0C9.5 6 7 10 0.5 11.5H11";
  return (
    <svg aria-hidden="true" width="10" height="12" viewBox="0 0 10 12" className={`ff-tail ff-tail-${side}`}>
      <path className="ff-tail-fill" d={fill} />
      {glow ? <path className="ff-tail-glow" d={fill} /> : null}
      <path className="ff-tail-edge" d={edge} />
    </svg>
  );
}

/** The paper-plane send icon beside each example. Decoration only. */
function PaperPlane() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[var(--accent-strong)]">
      <path fill="currentColor" d="M1.5 1.5 22.5 12 1.5 22.5 3.6 13.1 16 12 3.6 10.9Z" />
    </svg>
  );
}

/**
 * Example prompts as your own chat bubbles, waiting on the right with a
 * paper-plane icon, in small text; tapping one sends it.
 */
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
    <div className="ff-options flex flex-col items-end gap-3 py-1">
      {examples.map((ex) => (
        <button
          key={ex.text}
          type="button"
          disabled={disabled}
          onClick={() => onPick(ex.text)}
          className="ff-sample-btn flex max-w-[92%] items-center gap-4 rounded-2xl text-left disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span className="ff-sample relative min-w-0 rounded-2xl rounded-br-none px-3.5 py-2 text-xs font-medium leading-snug [overflow-wrap:anywhere]">
            {ex.text}
            <Tail side="right" glow />
          </span>
          <PaperPlane />
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
      {/* inert while closed: hidden buttons can't be tabbed to or read out. */}
      <div id={id} className="ff-collapse" data-open={open} inert={!open}>
        <div className="ff-collapse-inner">
          <div className="pt-2">
            <ExampleList examples={examples} onPick={onPick} disabled={disabled} />
          </div>
        </div>
      </div>
    </div>
  );
}
