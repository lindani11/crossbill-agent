import { z } from "zod";

export const PAYMENT_TERMS = ["DUE_ON_RECEIPT", "NET_10", "NET_15", "NET_30"] as const;
export type PaymentTerm = (typeof PAYMENT_TERMS)[number];

/** PayPal's units of measure for invoice lines. */
export const UNITS = ["QUANTITY", "HOURS", "AMOUNT"] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** One invoice line, amounts in USD. */
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
  invoice_id: z.string().min(1).max(64).regex(/^[A-Za-z0-9-]+$/, "Not a PayPal invoice id"),
  invoice_number: z.string().max(64).optional(),
  client_name: z.string().max(140).optional(),
  subject: z.string().min(1).max(200),
  note: z.string().min(1).max(4000),
});
export type ReminderProposal = z.infer<typeof reminderProposalSchema>;

export type Proposal =
  | { kind: "invoice"; total: number; data: InvoiceProposal }
  | { kind: "reminder"; data: ReminderProposal };

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

export function invoiceTotal(items: InvoiceProposal["items"]): number {
  const cents = items.reduce(
    (sum, it) => sum + Math.round(it.quantity * it.unit_amount * 100),
    0,
  );
  return cents / 100;
}
