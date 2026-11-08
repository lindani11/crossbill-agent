import "server-only";
import { APICallError, generateText, stepCountIs, tool, type LanguageModel, type ModelMessage } from "ai";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import { getLedger, paymentsIn, totals, type LedgerPayment } from "./ledger";
import { buildStatement } from "./statement";
import { localCurrency } from "./fx";
import { checkRecipient, exampleRecipients } from "./recipients";
import { buildExamples, type Example } from "./examples";
import { currencyName, currentSaTaxYearEnd, formatMoney, isIsoDate, saTaxYear, type Period } from "./money";
import {
  PAYMENT_TERMS,
  UNITS,
  invoiceProposalSchema,
  invoiceTotal,
  reminderProposalSchema,
  type Proposal,
} from "./schemas";

/**
 * The agent can READ from PayPal and PROPOSE actions. It cannot send
 * anything: invoices and reminders only go out when the freelancer taps
 * Approve, which calls a separate route. The approval step is enforced in
 * code, not just in the prompt.
 */

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  const cur = localCurrency();
  const name = currencyName(cur);
  const sample = formatMoney(1151.89, cur);
  const taxYear =
    cur === "ZAR"
      ? `\n- The South African tax year runs from 1 March to the end of February. "This tax year" is ${saTaxYear(currentSaTaxYearEnd()).from} to ${saTaxYear(currentSaTaxYearEnd()).to}; "the 2026 tax year" or "2025/26" is 2025-03-01 to 2026-02-28.`
      : "";
  return `You are Crossbill, an assistant for freelancers who bill overseas clients in US dollars through PayPal and keep their books in their own currency, ${name} (${cur}).
Freelancers can work in any field: tutoring and teaching, translation, design, writing, virtual assistance, photography, consulting, software development and more.
Today is ${today}.

What you can do:
- Draft an invoice: call propose_invoice. The freelancer must approve it before it is sent; never say an invoice was sent.
- Check invoices: call list_invoices to see status, amounts, who owes what, what is overdue, and what each payment was worth in ${cur}.
- Report earnings: call earnings for totals received in a period, in USD and ${cur}.
- Income statement for tax: call income_statement for a tax year or any period. It gives totals and monthly figures; the full statement with a CSV download is on the Statement page.
- Draft a payment reminder for an unpaid invoice: call list_invoices to find its id, then call propose_reminder. The freelancer approves before it is sent.
- Show the three example prompts as tappable buttons: call show_examples.

How to reply to anything:
- Be concise, polite and precise: usually one to three short sentences. Answer what was asked first.
- Greetings and "who are you?" or "what can you do?": say in one or two sentences that you are Crossbill, an AI agent that drafts PayPal invoices for the freelancer to approve, chases late payers, and keeps their books in ${cur} at each payment day's exchange rate. Then ask what they would like to do and call show_examples.
- Vague requests ("help", "invoice someone", "what now?"): say in one sentence what you can do, ask the one question that would get them started, and call show_examples.
- Requests outside invoicing, payments, earnings or their books: say politely in one sentence that it is outside what you do, offer what you can do instead, and call show_examples. Do not answer the unrelated question.
- Missing invoice details: ask only for what is missing, all in one short message (client name, client email, the work, quantity and price). Never guess.
- Unclear which client, invoice or period is meant: ask one short question, offering the likely options from a tool result when you have them.
- If a tool fails or returns an error, say plainly what went wrong and the next step (try again, check the email address, refresh later). Never say something worked when it did not.
- Never invent invoices, clients, emails, amounts, dates or rates. If you do not know, say so and offer to look it up.
- To show the examples you must call the show_examples tool. Never type "[Show examples]", a tool name or a description of buttons in your reply; the buttons appear under it on their own. Do not write the examples out either. Do not call show_examples after drafting an invoice or reminder, or after answering a question about figures.

Rules:
- Invoices are in USD. Convert phrases like "3 days at $250 a day" into quantity 3, unit_amount 250.
- Choose each line's unit:
  - HOURS when the work is billed per hour ("20 hours at $12 an hour" -> quantity 20, unit_amount 12).
  - AMOUNT for a flat fee ("logo and brand kit, $450 flat" -> quantity 1, unit_amount 450).
  - QUANTITY for anything counted: lessons, sessions, words, pages, days, photos ("8 lessons at $20" -> quantity 8, unit_amount 20; "4,500 words at $0.08" -> quantity 4500, unit_amount 0.08).
- Name line items after the work, in the freelancer's own field (e.g. "Maths lesson", "Translation, English to isiZulu", "Logo design", "Admin support").
- If the client's email address is missing, ask for it instead of guessing. Never invent an email address.
- If propose_invoice returns an error about the email address, pass that message on in one or two plain sentences and ask for another email. Never swap in a different address yourself.
- Keep line item names short; put detail in the description.
- Reminders must be polite, short and specific: mention the invoice number, amount and due date.
- After proposing, reply in one or two sentences telling the freelancer to review and approve. Keep replies short and plain.
- Write plain text only. No markdown: no asterisks, no bold, no headings, no tables. For a list, put each item on its own line starting with "- ".
- Refer to invoices by their number, e.g. "invoice #0002". Never show PayPal ids such as INV2-XXXX-XXXX; those are only for tool calls.
- Format money as "$870.00" and dates as "19 Nov 2026".
- Whenever you mention a paid invoice or money received, also give the ${cur} value, e.g. "$70.00 (${sample})". Copy the *_text values the tools return; never calculate, convert or guess amounts yourself.
- Each payment is converted at the exchange rate for the day it was paid. If asked, say so, and that the rate source is in the tool result.
- For "how much did I earn" questions, call earnings with the exact date range (e.g. October 2026 is 2026-10-01 to 2026-10-31).${taxYear}
- Crossbill keeps records; it does not give tax advice. For tax questions beyond the figures, suggest checking with a tax practitioner.`;
}

function money(value: number | null, currency: string): string | null {
  return value === null ? null : formatMoney(value, currency);
}

function totalsText(t: ReturnType<typeof totals>, currency: string) {
  return {
    outstanding_text: formatMoney(t.outstanding_usd, "USD"),
    overdue_text: formatMoney(t.overdue_usd, "USD"),
    overdue_count: t.overdue_count,
    received_text: formatMoney(t.paid_usd, "USD"),
    received_local_text: formatMoney(t.paid_local, currency),
    payments_count: t.paid_count,
    payments_without_rate: t.missing_rates,
  };
}

function paymentText(p: LedgerPayment, currency: string) {
  return {
    invoice_number: p.invoice_number,
    client: p.client,
    paid_on: p.paid_on,
    amount_text: formatMoney(p.amount_usd, "USD"),
    local_text: money(p.amount_local, currency),
    fx_rate: p.fx_rate,
    rate_date: p.fx_date,
  };
}

function buildTools(proposals: Proposal[], ui: { examples: boolean }) {
  return {
    show_examples: tool({
      description:
        "Show the three example prompts (tutor, developer, translator) as tappable buttons under your reply. Use after greetings, \"who are you\", vague or off-topic messages.",
      inputSchema: z.object({}),
      execute: async () => {
        ui.examples = true;
        return { ok: true, shown: "three example prompts as buttons under your reply" };
      },
    }),

    propose_invoice: tool({
      description:
        "Propose a USD invoice for the freelancer to review. Does NOT send anything; the freelancer must approve it.",
      inputSchema: z.object({
        client_name: z.string().describe("Client's full name or company name"),
        client_email: z.string().describe("Client's email address, exactly as given by the freelancer"),
        items: z
          .array(
            z.object({
              name: z.string().describe("Short line item name"),
              description: z.string().optional().describe("Optional detail for the line item"),
              quantity: z.number().describe("How many units: hours, lessons, words, days... Use 1 for a flat fee"),
              unit_amount: z.number().describe("Price per unit in USD, or the whole fee for a flat fee"),
              unit: z
                .enum(UNITS)
                .optional()
                .describe("HOURS for hourly work, AMOUNT for a flat fee, QUANTITY for anything counted. Default QUANTITY"),
            }),
          )
          .describe("Invoice line items"),
        note: z.string().optional().describe("Optional short note to the client"),
        payment_term: z
          .enum(PAYMENT_TERMS)
          .optional()
          .describe("When payment is due. Omit to use the default."),
      }),
      execute: async (input) => {
        const parsed = invoiceProposalSchema.safeParse(input);
        if (!parsed.success) {
          return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
        }
        // No card for an address that could never receive it (sandbox test clients only).
        const recipient = checkRecipient(parsed.data.client_email);
        if (!recipient.ok) return { ok: false, error: recipient.error };
        const total = invoiceTotal(parsed.data.items);
        proposals.push({ kind: "invoice", total, data: parsed.data });
        return { ok: true, status: "awaiting_approval", total_usd: total };
      },
    }),

    list_invoices: tool({
      description:
        "List the freelancer's PayPal invoices: status (SENT, PAID, PARTIALLY_PAID, CANCELLED...), client, total and amount due in USD, days overdue, and for paid invoices the payment date and the local-currency value at that day's exchange rate.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const { currency, rows } = await getLedger(30);
          const t = totals(rows);
          return {
            ok: true,
            currency,
            invoices: rows.map((r) => ({
              id: r.id,
              invoice_number: r.number,
              client: r.client,
              client_email: r.client_email,
              status: r.status,
              days_overdue: r.days_overdue,
              invoice_date: r.invoice_date,
              due_date: r.due_date,
              total_usd: r.total_usd,
              total_text: money(r.total_usd, "USD"),
              due_text: money(r.due_usd, "USD"),
              paid_text: money(r.paid_usd, "USD"),
              paid_on: r.paid_on,
              paid_local_text: money(r.paid_local, currency),
              fx_rate: r.fx_rate,
            })),
            totals: totalsText(t, currency),
          };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : "Could not load invoices" };
        }
      },
    }),

    earnings: tool({
      description:
        "Total money received in a date range, in USD and in the freelancer's local currency at each payment day's exchange rate, plus what is still outstanding. Use for questions like 'what did I earn in October?' or 'how much this year?'.",
      inputSchema: z.object({
        from: z.string().optional().describe("Start date YYYY-MM-DD, inclusive. Omit for all time."),
        to: z.string().optional().describe("End date YYYY-MM-DD, inclusive. Omit for up to today."),
      }),
      execute: async ({ from, to }) => {
        try {
          const { currency, rows } = await getLedger(50);
          const f = isIsoDate(from) ? from : undefined;
          const tt = isIsoDate(to) ? to : undefined;
          return {
            ok: true,
            currency,
            from: f ?? "all time",
            to: tt ?? "today",
            totals: totalsText(totals(rows, f, tt), currency),
            payments: paymentsIn(rows, f, tt).map((p) => paymentText(p, currency)),
            rate_method: "Each payment at the exchange rate for the day it was paid",
          };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : "Could not load earnings" };
        }
      },
    }),

    income_statement: tool({
      description:
        "Income statement for tax: every payment in a period converted at its payment-day exchange rate, with monthly totals. For South Africa the default period is the current tax year (1 March to end of February). The full statement, with a CSV download and print view, is on the Statement page.",
      inputSchema: z.object({
        tax_year_end: z
          .number()
          .int()
          .optional()
          .describe("South African tax year by the year it ends, e.g. 2027 for 1 Mar 2026 to 28 Feb 2027"),
        from: z.string().optional().describe("Custom start date YYYY-MM-DD"),
        to: z.string().optional().describe("Custom end date YYYY-MM-DD"),
      }),
      execute: async ({ tax_year_end, from, to }) => {
        try {
          const cur = localCurrency();
          let period: Period;
          if (isIsoDate(from) && isIsoDate(to) && from <= to) {
            period = { from, to, label: `${from} to ${to}` };
          } else if (tax_year_end && tax_year_end > 2000 && tax_year_end < 2100) {
            period = saTaxYear(tax_year_end);
          } else if (cur === "ZAR") {
            period = saTaxYear(currentSaTaxYearEnd());
          } else {
            const y = new Date().getUTCFullYear();
            period = { from: `${y}-01-01`, to: `${y}-12-31`, label: `Calendar year ${y}` };
          }
          const st = await buildStatement(period);
          return {
            ok: true,
            currency: st.currency,
            period: st.period,
            payments: st.totals.payments,
            total_usd_text: formatMoney(st.totals.usd, "USD"),
            total_local_text: formatMoney(st.totals.local, st.currency),
            average_rate: st.totals.average_rate,
            missing_rates: st.totals.missing_rates,
            months: st.months.map((m) => ({
              month: m.month,
              payments: m.payments,
              usd_text: formatMoney(m.usd, "USD"),
              local_text: formatMoney(m.local, st.currency),
            })),
            method: st.method,
            where_to_download: "Statement page (tab at the top of Crossbill), with these dates",
          };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : "Could not build the statement" };
        }
      },
    }),

    propose_reminder: tool({
      description:
        "Propose a payment reminder for an unpaid, already-sent invoice. Does NOT send anything; the freelancer must approve it.",
      inputSchema: z.object({
        invoice_id: z.string().describe("PayPal invoice id from list_invoices, e.g. INV2-XXXX-XXXX-XXXX-XXXX"),
        invoice_number: z.string().optional(),
        client_name: z.string().optional(),
        subject: z.string().describe("Email subject line"),
        note: z.string().describe("Short, polite reminder message"),
      }),
      execute: async (input) => {
        const parsed = reminderProposalSchema.safeParse(input);
        if (!parsed.success) {
          return { ok: false, error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
        }
        proposals.push({ kind: "reminder", data: parsed.data });
        return { ok: true, status: "awaiting_approval" };
      },
    }),
  };
}

/**
 * Providers in the order to try them. AI_PROVIDER_ORDER sets the order
 * (default "groq,gemini"); providers without an API key are skipped.
 */
function providers(): { name: string; model: LanguageModel }[] {
  const make: Record<string, () => LanguageModel | null> = {
    groq: () =>
      process.env.GROQ_API_KEY ? groq(process.env.GROQ_MODEL || "openai/gpt-oss-120b") : null,
    gemini: () =>
      process.env.GOOGLE_GENERATIVE_AI_API_KEY
        ? google(process.env.GEMINI_MODEL || "gemini-3.8-flash")
        : null,
  };
  const order = (process.env.AI_PROVIDER_ORDER || "groq,gemini")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s in make);

  const list: { name: string; model: LanguageModel }[] = [];
  for (const name of order) {
    const model = make[name]();
    if (model) list.push({ name, model });
  }
  return list;
}

type AgentResult = { text: string; proposals: Proposal[]; suggestions?: Example[]; provider: string };

// Longest wait worth taking before retrying a rate-limited provider. Longer
// waits go straight to the backup instead (the chat route allows 60 s in all).
const MAX_RATE_LIMIT_WAIT_MS = 10_000;

/**
 * For a short per-minute rate limit (HTTP 429 with "try again in 3.7s" or a
 * Retry-After header), returns how long to wait before retrying; otherwise null.
 */
function shortRateLimitWait(err: unknown): number | null {
  if (!APICallError.isInstance(err) || err.statusCode !== 429) return null;
  let seconds: number | null = null;
  const header = err.responseHeaders?.["retry-after"];
  if (header && Number.isFinite(Number(header))) seconds = Number(header);
  const hint = /try again in ([\d.]+)s/i.exec(err.message);
  if (hint) seconds = Math.max(seconds ?? 0, Number(hint[1]));
  if (seconds === null || !Number.isFinite(seconds)) return null;
  const ms = Math.ceil(seconds * 1000) + 500;
  return ms <= MAX_RATE_LIMIT_WAIT_MS ? ms : null;
}

/**
 * Removes tool-call JSON a model sometimes writes into its reply, such as
 * {"tool": "functions.show_examples", "arguments": {}}, fenced or bare.
 */
function stripToolJson(text: string): { text: string; mentionsExamples: boolean } {
  let out = text.replace(/```(?:json)?\s*([\s\S]*?)```/gi, (block, inner: string) =>
    /"(tool|function|name|arguments|parameters)"\s*:/.test(inner) ? inner : block,
  );
  let mentionsExamples = false;
  for (let start = out.indexOf("{"); start !== -1; start = out.indexOf("{", start + 1)) {
    let depth = 0;
    let end = -1;
    for (let i = start; i < out.length; i++) {
      if (out[i] === "{") depth++;
      else if (out[i] === "}" && --depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) break;
    const candidate = out.slice(start, end + 1);
    if (/"(tool|function|tool_name|arguments|parameters)"\s*:/.test(candidate)) {
      if (/show_examples/.test(candidate)) mentionsExamples = true;
      out = out.slice(0, start) + out.slice(end + 1);
      start -= 1;
    }
  }
  return { text: out.replace(/\n{3,}/g, "\n\n").trim(), mentionsExamples };
}

/** "[Show examples]", "show_examples()" and similar, typed by a model instead of calling the tool. */
const EXAMPLES_PLACEHOLDER = /\[\s*show[\s_-]*examples?\s*\]|\bshow_examples\b(\s*\(\s*\))?/i;

/** Greetings and "who are you / what can you do / help" messages. */
const GETTING_STARTED =
  /^\s*(hi|hello|hey|hiya|howzit|sawubona|molo|dumela|good\s+(morning|afternoon|evening)|who\s+are\s+you|what\s+(can|do)\s+you\s+do|what\s+is\s+crossbill|help|start|get\s+started)\b[\s\S]{0,40}$/i;

function lastUserText(messages: ModelMessage[]): string {
  const last = [...messages].reverse().find((m) => m.role === "user");
  return typeof last?.content === "string" ? last.content : "";
}

/**
 * Runs the agent on the main model and falls back to the backup model if the
 * main one fails (for example when the free daily quota is used up).
 */
export async function runAgent(messages: ModelMessage[]): Promise<AgentResult> {
  const available = providers();
  if (available.length === 0) {
    throw new Error("Set GOOGLE_GENERATIVE_AI_API_KEY or GROQ_API_KEY in .env.local");
  }

  let lastError: unknown;
  for (const [index, { name, model }] of available.entries()) {
    const isLast = index === available.length - 1;
    // One extra try after a short rate-limit wait (e.g. Groq's tokens-per-minute
    // limit says "try again in 4s"): waiting a few seconds beats a busy backup.
    for (let attempt = 0; attempt < 2; attempt++) {
      const proposals: Proposal[] = [];
      const ui = { examples: false };
      try {
        const result = await generateText({
          model,
          system: systemPrompt(),
          messages,
          tools: buildTools(proposals, ui),
          stopWhen: stepCountIs(5),
          // Don't retry a provider that has a backup: switching is faster.
          maxRetries: isLast ? 1 : 0,
          temperature: 0.2,
        });
        let text = result.text.trim();
        // Never leave the freelancer with an empty reply and nothing to do next.
        if (!text && proposals.length > 0) text = "Here's the draft. Review it and tap Approve to send.";
        if (!text) {
          text = "I can draft PayPal invoices for you to approve, chase late payers and show what you've earned. What would you like to do?";
          ui.examples = true;
        }
        // Backstop for models that write a tool call as text (JSON or "[Show examples]").
        const cleaned = stripToolJson(text);
        if (cleaned.mentionsExamples) ui.examples = true;
        text = cleaned.text;
        // Backstop for models that type the tool instead of calling it ("[Show examples]").
        if (EXAMPLES_PLACEHOLDER.test(text)) {
          text = text.replace(new RegExp(EXAMPLES_PLACEHOLDER.source, "gi"), "").replace(/\n{3,}/g, "\n\n").trim();
          ui.examples = true;
        }
        // A greeting or "what can you do?" always gets the example buttons.
        if (proposals.length === 0 && GETTING_STARTED.test(lastUserText(messages))) ui.examples = true;
        const suggestions = ui.examples && proposals.length === 0 ? buildExamples(exampleRecipients()) : undefined;
        return { text, proposals, suggestions, provider: name };
      } catch (err) {
        lastError = err;
        const wait = attempt === 0 ? shortRateLimitWait(err) : null;
        if (wait !== null) {
          console.warn(`[agent] ${name} rate-limited, retrying in ${wait} ms`);
          await new Promise((resolve) => setTimeout(resolve, wait));
          continue;
        }
        console.error(`[agent] ${name} failed, trying next provider`, err);
        break;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All AI providers failed");
}
