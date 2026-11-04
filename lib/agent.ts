import "server-only";
import { generateText, stepCountIs, tool, type LanguageModel, type ModelMessage } from "ai";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { z } from "zod";
import { listInvoices } from "./paypal";
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
  return `You are Crossbill, an assistant for freelancers who bill overseas clients in US dollars through PayPal.
Freelancers can work in any field: tutoring and teaching, translation, design, writing, virtual assistance, photography, consulting, software development and more.
Today is ${today}.

What you can do:
- Draft an invoice: call propose_invoice. The freelancer must approve it before it is sent; never say an invoice was sent.
- Check invoices: call list_invoices to see status, amounts and who owes what.
- Draft a payment reminder for an unpaid invoice: call list_invoices to find its id, then call propose_reminder. The freelancer approves before it is sent.

Rules:
- All amounts are in USD. Convert phrases like "3 days at $250 a day" into quantity 3, unit_amount 250.
- Choose each line's unit:
  - HOURS when the work is billed per hour ("20 hours at $12 an hour" -> quantity 20, unit_amount 12).
  - AMOUNT for a flat fee ("logo and brand kit, $450 flat" -> quantity 1, unit_amount 450).
  - QUANTITY for anything counted: lessons, sessions, words, pages, days, photos ("8 lessons at $20" -> quantity 8, unit_amount 20; "4,500 words at $0.08" -> quantity 4500, unit_amount 0.08).
- Name line items after the work, in the freelancer's own field (e.g. "Maths lesson", "Translation, English to isiZulu", "Logo design", "Admin support").
- If the client's email address is missing, ask for it instead of guessing. Never invent an email address.
- Keep line item names short; put detail in the description.
- Reminders must be polite, short and specific: mention the invoice number, amount and due date.
- After proposing, reply in one or two sentences telling the freelancer to review and approve. Keep replies short and plain.`;
}

function buildTools(proposals: Proposal[]) {
  return {
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
        const total = invoiceTotal(parsed.data.items);
        proposals.push({ kind: "invoice", total, data: parsed.data });
        return { ok: true, status: "awaiting_approval", total_usd: total };
      },
    }),

    list_invoices: tool({
      description:
        "List the freelancer's most recent PayPal invoices with status (DRAFT, SENT, PAID, PARTIALLY_PAID, CANCELLED...), client, total and amount due.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          return { ok: true, invoices: await listInvoices(20) };
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : "Could not load invoices" };
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

export type AgentResult = { text: string; proposals: Proposal[]; provider: string };

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
    const proposals: Proposal[] = [];
    try {
      const result = await generateText({
        model,
        system: systemPrompt(),
        messages,
        tools: buildTools(proposals),
        stopWhen: stepCountIs(5),
        // Don't retry a provider that has a backup: switching is faster.
        maxRetries: isLast ? 1 : 0,
        temperature: 0.2,
      });
      const text =
        result.text.trim() ||
        (proposals.length > 0 ? "Here's the draft. Review it and tap Approve to send." : "Done.");
      return { text, proposals, provider: name };
    } catch (err) {
      lastError = err;
      console.error(`[agent] ${name} failed, trying next provider`, err);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("All AI providers failed");
}
