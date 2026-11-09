import { NextResponse } from "next/server";
import { z } from "zod";
import { createAndSendInvoice, PayPalError } from "@/lib/paypal";
import { invoiceProposalSchema } from "@/lib/schemas";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { checkRecipient } from "@/lib/recipients";

/**
 * POST /api/invoices/send · Creates a PayPal invoice and sends it
 *
 * Runs only when the freelancer taps Approve & send on an invoice card:
 *   card → rate limit (10 per 10 min) → zod check → sandbox allowlist
 *        → lib/paypal.ts createAndSendInvoice() → { invoice, payerUrl }
 *
 * The browser sends the whole proposal back, so it is checked again here as if
 * it were new: nothing that comes from the browser is trusted.
 */

// Node.js runtime: the PayPal client uses Node's Buffer.
export const runtime = "nodejs";

const bodySchema = z.object({
  proposal: invoiceProposalSchema,
  // Generated once per proposal in the browser so a double tap or retry
  // can never create a second invoice.
  requestId: z.string().uuid(),
});

/** Called only when the freelancer taps Approve on an invoice card. */
export async function POST(req: Request) {
  if (!rateLimit(`send:${clientIp(req)}`, 10)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid invoice", issues: parsed.error.issues }, { status: 400 });
  }

  // Sandbox: only the listed test client accounts can receive invoices.
  const recipient = checkRecipient(parsed.data.proposal.client_email);
  if (!recipient.ok) {
    return NextResponse.json({ error: recipient.error }, { status: 403 });
  }

  try {
    const result = await createAndSendInvoice(parsed.data.proposal, parsed.data.requestId);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[invoices/send]", err);
    const message = err instanceof PayPalError ? err.message : "Could not send the invoice.";
    // PayPal refused our input (4xx) → 400; PayPal or the network failed → 502.
    const status = err instanceof PayPalError && err.status < 500 ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
