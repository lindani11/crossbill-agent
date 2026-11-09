import { NextResponse } from "next/server";
import { getInvoice, verifyWebhookSignature, type PayPalInvoice } from "@/lib/paypal";
import { formatLocal, localCurrency, usdToLocal } from "@/lib/fx";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/**
 * POST /api/paypal/webhook · PayPal reports that an invoice was paid
 *
 *   PayPal → rate limit and size cap → PayPal verifies the signature
 *          → INVOICING.INVOICE.PAID? → re-read the invoice from PayPal
 *          → the rate for the payment date (lib/fx.ts) → one log line
 *
 * Set up in the PayPal developer dashboard: a webhook on the sandbox app for
 * "Invoicing invoice paid" that points here; its id goes in PAYPAL_WEBHOOK_ID.
 */

// Node.js runtime: the PayPal client uses Node's Buffer.
export const runtime = "nodejs";

// The parts of PayPal's event that Crossbill reads.
type WebhookEvent = {
  id: string;
  event_type: string;
  create_time?: string;
  // Invoicing events wrap the invoice as resource.invoice; accept both shapes.
  resource?: { invoice?: Partial<PayPalInvoice> } & Partial<PayPalInvoice>;
};

/**
 * PayPal calls this when an invoice is paid. We only trust the event after
 * PayPal itself confirms the signature, then re-read the invoice from PayPal
 * so the amount comes from PayPal's records, not the webhook body.
 * No database: the dashboard and statement rebuild the books from PayPal,
 * so this route confirms the payment and logs it in local currency.
 */
export async function POST(req: Request) {
  // Every call costs a signature check against PayPal, so cap the rate and size.
  if (!rateLimit(`webhook:${clientIp(req)}`, 120)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  // Read as text first, so an oversized body is refused before it is parsed
  // and before PayPal is asked to verify it.
  const raw = await req.text();
  if (raw.length > 200_000) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  let event: WebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // PayPal signs each delivery; these headers and the event are what it checks.
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

  if (event.event_type !== "INVOICING.INVOICE.PAID") {
    // Acknowledge other events so PayPal doesn't keep retrying them.
    return NextResponse.json({ ok: true, ignored: event.event_type });
  }

  const fromEvent = event.resource?.invoice ?? event.resource;
  const invoiceId = fromEvent?.id;
  if (!invoiceId) {
    console.error("[webhook] paid event without an invoice id; resource keys:", Object.keys(event.resource ?? {}));
    // 200 so PayPal stops retrying an event we can never process.
    return NextResponse.json({ ok: false, error: "No invoice id in event" });
  }

  // Authoritative copy from PayPal; fall back to the event body if that fails.
  let inv: Partial<PayPalInvoice> = fromEvent ?? {};
  try {
    inv = await getInvoice(invoiceId);
  } catch (err) {
    console.error("[webhook] could not re-read invoice, using event body", invoiceId, err);
  }

  // What was paid, and when: the latest payment date, else the event time, else now.
  const paid = inv.payments?.paid_amount ?? inv.amount;
  const latestPayment = (inv.payments?.transactions ?? [])
    .map((t) => t.payment_date)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1);
  const paidOn = latestPayment ?? event.create_time ?? new Date().toISOString();
  const usd = paid ? Number(paid.value) : null;

  const currency = localCurrency();
  const fx = usd !== null ? await usdToLocal(paidOn) : null;
  const local = usd !== null && fx ? Math.round(usd * fx.rate * 100) / 100 : null;

  // One structured log line per payment, visible in the Vercel logs. The books
  // are rebuilt from PayPal on every request, so nothing needs storing.
  const record = {
    event_id: event.id,
    invoice_id: invoiceId,
    invoice_number: inv.detail?.invoice_number ?? null,
    status: inv.status ?? null,
    paid_usd: usd,
    paid_on: paidOn.slice(0, 10),
    currency,
    fx_rate: fx?.rate ?? null,
    fx_date: fx?.date ?? null,
    fx_source: fx?.source ?? null,
    paid_local: local,
  };
  console.log(
    `[payment] invoice #${record.invoice_number ?? "?"} paid ` +
      (usd !== null ? `$${usd.toFixed(2)}` : "(amount unknown)") +
      (local !== null ? ` = ${formatLocal(local)} at ${fx?.rate} USD/${currency} (${fx?.date})` : " (no FX rate)"),
    JSON.stringify(record),
  );

  return NextResponse.json({ ok: true });
}
