import { NextResponse } from "next/server";
import { PayPalError, getInvoice, sendReminder } from "@/lib/paypal";
import { reminderProposalSchema } from "@/lib/schemas";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { checkRecipient } from "@/lib/recipients";

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
