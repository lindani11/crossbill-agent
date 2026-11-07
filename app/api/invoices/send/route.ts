import { NextResponse } from "next/server";
import { z } from "zod";
import { createAndSendInvoice, PayPalError } from "@/lib/paypal";
import { invoiceProposalSchema } from "@/lib/schemas";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { checkRecipient } from "@/lib/recipients";

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
    const status = err instanceof PayPalError && err.status < 500 ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
