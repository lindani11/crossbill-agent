import { z } from "zod";

/**
 * lib/schemas.ts · The shape of everything that crosses a boundary
 *
 * zod schemas check data at runtime AND give TypeScript types (z.infer), so one
 * definition both guards the API routes and types the code.
 *
 * How it connects
 *   lib/agent.ts            → checks what the model proposes
 *   app/api/chat            → chatRequestSchema
 *   app/api/invoices/send   → invoiceProposalSchema
 *   app/api/invoices/remind → reminderProposalSchema
 *   components/*            → the Proposal type for the approval cards
 */

// PayPal's due terms that Crossbill offers. `as const` keeps the exact strings,
// so PaymentTerm below is the union "DUE_ON_RECEIPT" | "NET_10" | ...
export const PAYMENT_TERMS = ["DUE_ON_RECEIPT", "NET_10", "NET_15", "NET_30"] as const;
export type PaymentTerm = (typeof PAYMENT_TERMS)[number];

/** PayPal's units of measure for invoice lines: counted items, hours, or a flat fee. */
export const UNITS = ["QUANTITY", "HOURS", "AMOUNT"] as const;

// A deliberately simple email check (something@something.tld); PayPal and the
// sandbox allowlist (lib/recipients.ts) do the rest.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One invoice line, amounts in USD. The limits stop nonsense (a negative
 * price, a ten-million-unit line) before PayPal ever sees it.
 */
const lineItemSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  quantity: z.number().positive().max(100000),
  unit_amount: z.number().min(0).max(1000000),
  unit: z.enum(UNITS).optional(),
});

/**
 * An invoice the agent proposes. Nothing is sent to the client until the
 * freelancer taps Approve, which posts this object to /api/invoices/send.
 */
export const invoiceProposalSchema = z.object({
  client_name: z.string().min(1).max(140),
  client_email: z.string().max(254).regex(EMAIL_RE, "Must be a valid email address"),
  items: z.array(lineItemSchema).min(1).max(50),
  note: z.string().max(4000).optional(),
  payment_term: z.enum(PAYMENT_TERMS).optional(),
});
export type InvoiceProposal = z.infer<typeof invoiceProposalSchema>;

/** A reminder the agent proposes for an unpaid invoice. */
export const reminderProposalSchema = z.object({
  // Letters, digits and dashes only, so an id can't change the PayPal URL it goes into.
  invoice_id: z.string().min(1).max(64).regex(/^[A-Za-z0-9-]+$/, "Not a PayPal invoice id"),
  invoice_number: z.string().max(64).optional(),
  client_name: z.string().max(140).optional(),
  subject: z.string().min(1).max(200),
  note: z.string().min(1).max(4000),
});
export type ReminderProposal = z.infer<typeof reminderProposalSchema>;

/** A draft waiting for the freelancer, shown as a card with Approve & send. */
export type Proposal =
  | { kind: "invoice"; total: number; data: InvoiceProposal }
  | { kind: "reminder"; data: ReminderProposal };

/** What the browser may send to /api/chat: 1 to 40 messages, 8,000 characters each. */
export const chatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(8000),
      }),
    )
    .min(1)
    .max(40),
});

/** The invoice total, added up in whole cents, so $0.10 + $0.20 is exactly $0.30. */
export function invoiceTotal(items: InvoiceProposal["items"]): number {
  const cents = items.reduce(
    (sum, it) => sum + Math.round(it.quantity * it.unit_amount * 100),
    0,
  );
  return cents / 100;
}
