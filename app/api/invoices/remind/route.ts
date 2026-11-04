import { NextResponse } from "next/server";
import { PayPalError, sendReminder } from "@/lib/paypal";
import { reminderProposalSchema } from "@/lib/schemas";
import { clientIp, rateLimit } from "@/lib/ratelimit";

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
    await sendReminder(parsed.data);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[invoices/remind]", err);
    const message = err instanceof PayPalError ? err.message : "Could not send the reminder.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
