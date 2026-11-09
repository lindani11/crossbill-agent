import { NextResponse } from "next/server";
import { PayPalError, getInvoice, sendReminder } from "@/lib/paypal";
import { reminderProposalSchema } from "@/lib/schemas";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { checkRecipient } from "@/lib/recipients";

/**
 * POST /api/invoices/remind · Sends a PayPal payment reminder
 *
 * Runs only when the freelancer taps Approve & send on a reminder card:
 *   card → rate limit → zod check → read the invoice from PayPal
 *        → allowlist check on its client email → lib/paypal.ts sendReminder()
 *
 * The email is read from PayPal, not taken from the browser, so a reminder can
 * only go to the client the invoice was really sent to.
 */

// Node.js runtime: the PayPal client uses Node's Buffer.
export const runtime = "nodejs";

/** Called only when the freelancer taps Approve on a reminder card. */
export async function POST(req: Request) {
  if (!rateLimit(`remind:${clientIp(req)}`, 10)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const parsed = reminderProposalSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid reminder" }, { status: 400 });
  }

  try {
    // Sandbox: only remind the listed test client accounts.
    const invoice = await getInvoice(parsed.data.invoice_id);
    const recipient = checkRecipient(invoice.primary_recipients?.[0]?.billing_info?.email_address);
    if (!recipient.ok) {
      return NextResponse.json({ error: recipient.error }, { status: 403 });
    }

    await sendReminder(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[invoices/remind]", err);
    const message = err instanceof PayPalError ? err.message : "Could not send the reminder.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
