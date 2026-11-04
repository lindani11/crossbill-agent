import { NextResponse } from "next/server";
import { verifyWebhookSignature, type PayPalInvoice } from "@/lib/paypal";
import { formatZar, usdToZar } from "@/lib/fx";

export const runtime = "nodejs";

type WebhookEvent = {
  id: string;
  event_type: string;
  create_time?: string;
  resource?: PayPalInvoice & {
    payments?: {
      paid_amount?: { value: string; currency_code: string };
      transactions?: { payment_date?: string; amount?: { value: string; currency_code: string } }[];
    };
  };
};

/**
 * PayPal calls this when an invoice is paid. We only trust the event after
 * PayPal itself confirms the signature, then record the payment with its
 * rand value. Storage in Supabase comes next; for now it goes to the logs.
 */
export async function POST(req: Request) {
  const raw = await req.text();
  let event: WebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const verified = await verifyWebhookSignature(
    {
      authAlgo: req.headers.get("paypal-auth-algo"),
      certUrl: req.headers.get("paypal-cert-url"),
      transmissionId: req.headers.get("paypal-transmission-id"),
      transmissionSig: req.headers.get("paypal-transmission-sig"),
      transmissionTime: req.headers.get("paypal-transmission-time"),
    },
    event,
  );
  if (!verified) {
    console.warn("[webhook] rejected unverified event", event?.id, event?.event_type);
    return NextResponse.json({ error: "Signature verification failed" }, { status: 401 });
  }

  if (event.event_type !== "INVOICING.INVOICE.PAID" || !event.resource) {
    // Acknowledge other events so PayPal doesn't keep retrying them.
    return NextResponse.json({ ok: true, ignored: event.event_type });
  }

  const inv = event.resource;
  const paid = inv.payments?.paid_amount ?? inv.amount;
  const paidOn =
    inv.payments?.transactions?.[0]?.payment_date ?? event.create_time ?? new Date().toISOString();
  const usd = paid ? Number(paid.value) : null;

  const fx = usd !== null ? await usdToZar(paidOn) : null;
  const zar = usd !== null && fx ? Math.round(usd * fx.rate * 100) / 100 : null;

  const record = {
    event_id: event.id,
    invoice_id: inv.id,
    invoice_number: inv.detail?.invoice_number ?? null,
    paid_usd: usd,
    paid_on: paidOn,
    usd_zar_rate: fx?.rate ?? null,
    rate_date: fx?.date ?? null,
    paid_zar: zar,
  };
  console.log(
    `[payment] invoice #${record.invoice_number} paid $${usd?.toFixed(2)}` +
      (zar !== null ? ` = ${formatZar(zar)} at ${fx?.rate} (${fx?.date})` : " (no FX rate)"),
    JSON.stringify(record),
  );

  return NextResponse.json({ ok: true, record });
}
