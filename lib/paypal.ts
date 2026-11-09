import "server-only";
import type { InvoiceProposal, PaymentTerm, ReminderProposal } from "./schemas";

/**
 * lib/paypal.ts · The PayPal REST client (Invoicing v2 and webhooks)
 *
 * Every call Crossbill makes to PayPal goes through this file: the OAuth token,
 * creating and sending invoices, reading them back, reminders, and asking
 * PayPal to verify a webhook.
 *
 * How it connects
 *   app/api/invoices/send   → createAndSendInvoice() → PayPal creates and sends
 *   app/api/invoices/remind → getInvoice() → sendReminder()
 *   app/api/paypal/webhook  → verifyWebhookSignature() → getInvoice()
 *   lib/ledger.ts           → listInvoices() + getInvoice() → the books
 *
 * Key ideas
 *   1. import "server-only" (first line) makes the build fail if browser code
 *      ever imports this file, so the client secret can't reach the page.
 *   2. One fetch wrapper, paypal<T>(), adds the token, JSON and error handling.
 *   3. PayPal-Request-Id makes "create invoice" idempotent: a retry with the
 *      same id gets the same invoice back instead of a duplicate.
 *   4. A webhook is trusted only after PayPal itself verifies its signature.
 */

// Sandbox unless PAYPAL_API_BASE says otherwise (https://api-m.paypal.com is
// live). IS_SANDBOX also decides who may receive invoices (lib/recipients.ts)
// and which PayPal site the payment link opens.
const API_BASE = process.env.PAYPAL_API_BASE ?? "https://api-m.sandbox.paypal.com";
export const IS_SANDBOX = API_BASE.includes("sandbox");

// The OAuth token, kept in memory and shared by every request on this server
// instance until shortly before it expires.
let cachedToken: { value: string; expiresAt: number } | null = null;

// Keeps PayPal's HTTP status and debug_id. The send route turns a 4xx into a
// 400 for the browser and anything else into a 502; debug_id is what PayPal
// support asks for when tracing a failed call.
export class PayPalError extends Error {
  constructor(
    message: string,
    public status: number,
    public debugId?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "PayPalError";
  }
}

/**
 * OAuth 2.0 client-credentials grant: trade the client id and secret (Basic
 * auth) for a bearer token used on every other call. The cached token is
 * reused while more than 60 seconds of its life remain.
 */
async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    throw new PayPalError("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set", 500);
  }

  const res = await fetch(`${API_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new PayPalError(`PayPal auth failed (${res.status})`, res.status);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/**
 * The one doorway to PayPal. Adds the bearer token, sends and parses JSON,
 * never caches (money data must be fresh), and turns PayPal's error body into
 * a PayPalError such as "MISSING_REQUIRED_PARAMETER: ...".
 */
async function paypal<T>(
  path: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<T> {
  const token = await getAccessToken();
  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });

  // Some calls, such as remind, answer with an empty body: parse only real text.
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const issue = json?.details?.[0]?.issue ?? json?.name ?? "UNKNOWN_ERROR";
    const description = json?.details?.[0]?.description ?? json?.message ?? res.statusText;
    throw new PayPalError(`${issue}: ${description}`, res.status, json?.debug_id, json?.details);
  }
  return json as T;
}

// ---------- Types (only the fields Crossbill uses) ----------

type Money = { currency_code: string; value: string };

export type PayPalInvoice = {
  id: string;
  status: string;
  detail: { invoice_number?: string; invoice_date?: string; currency_code: string; payment_term?: { term_type?: string; due_date?: string } };
  primary_recipients?: { billing_info?: { name?: { given_name?: string; surname?: string; full_name?: string }; email_address?: string } }[];
  amount?: { value: string; currency_code: string };
  due_amount?: Money;
  payments?: {
    paid_amount?: Money;
    transactions?: { payment_id?: string; payment_date?: string; amount?: Money }[];
  };
  links?: { href: string; rel: string; method?: string }[];
};

type InvoiceSummary = {
  id: string;
  number: string | null;
  status: string;
  client: string | null;
  client_email: string | null;
  total: string | null;
  due: string | null;
  invoice_date: string | null;
  due_date: string | null;
};

// ---------- Helpers ----------

// PayPal wants a given name and a surname: "Jack Smith" → Jack + Smith,
// "Mary Jane Smith" → Mary Jane + Smith; a one-word name fills both.
function splitName(full: string): { given_name: string; surname: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { given_name: parts[0], surname: parts[0] };
  return { given_name: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
}

// Today's date in UTC as YYYY-MM-DD, the format PayPal expects.
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The page a client opens to pay. */
function payerViewUrl(invoiceId: string): string {
  const host = IS_SANDBOX ? "https://www.sandbox.paypal.com" : "https://www.paypal.com";
  return `${host}/invoice/p/#${invoiceId}`;
}

// Flattens PayPal's nested invoice into the few fields the invoice card shows.
function summarize(inv: PayPalInvoice): InvoiceSummary {
  const r = inv.primary_recipients?.[0]?.billing_info;
  const name = r?.name?.full_name ?? [r?.name?.given_name, r?.name?.surname].filter(Boolean).join(" ");
  return {
    id: inv.id,
    number: inv.detail?.invoice_number ?? null,
    status: inv.status,
    client: name || null,
    client_email: r?.email_address ?? null,
    total: inv.amount ? `${inv.amount.value} ${inv.amount.currency_code}` : null,
    due: inv.due_amount ? `${inv.due_amount.value} ${inv.due_amount.currency_code}` : null,
    invoice_date: inv.detail?.invoice_date ?? null,
    due_date: inv.detail?.payment_term?.due_date ?? null,
  };
}

// ---------- Invoicing API ----------

/**
 * Creates a draft invoice in USD and sends it to the client.
 * requestId makes the create call idempotent, so a retried request
 * never produces a second invoice.
 */
export async function createAndSendInvoice(
  proposal: InvoiceProposal,
  requestId: string,
): Promise<{ invoice: InvoiceSummary; payerUrl: string }> {
  // Due terms: what the agent proposed, else DEFAULT_PAYMENT_TERM, else NET_15.
  const term: PaymentTerm =
    proposal.payment_term ?? ((process.env.DEFAULT_PAYMENT_TERM as PaymentTerm) || "NET_15");

  // 1. Reserve the next sequential invoice number (0001, 0002, ...).
  const { invoice_number } = await paypal<{ invoice_number: string }>(
    "/v2/invoicing/generate-next-invoice-number",
    { method: "POST" },
  );

  // The name clients see on the invoice, e.g. "Lindani Mthembu Studio".
  const businessName = process.env.BUSINESS_NAME?.trim().slice(0, 300) || undefined;

  // 2. The invoice itself, as a function so it can be rebuilt without the
  //    business name (see the retry below). Amounts are always USD.
  const body = (withInvoicer: boolean) => ({
    detail: {
      invoice_number,
      invoice_date: today(),
      currency_code: "USD",
      note: proposal.note,
      payment_term: { term_type: term },
    },
    ...(withInvoicer && businessName ? { invoicer: { business_name: businessName } } : {}),
    primary_recipients: [
      {
        billing_info: {
          name: splitName(proposal.client_name),
          email_address: proposal.client_email,
        },
      },
    ],
    items: proposal.items.map((it) => {
      // A flat fee is one line of the full amount, whatever quantity the model sent.
      const flat = it.unit === "AMOUNT";
      const value = flat ? it.quantity * it.unit_amount : it.unit_amount;
      return {
        name: it.name,
        description: it.description,
        quantity: flat ? "1" : String(it.quantity),
        unit_amount: { currency_code: "USD", value: value.toFixed(2) },
        unit_of_measure: it.unit ?? "QUANTITY",
      };
    }),
  });

  // 3. Create it as a DRAFT. The same PayPal-Request-Id always gets the same
  //    invoice back, so a retried request can never create a second one.
  let draft: PayPalInvoice;
  try {
    draft = await paypal<PayPalInvoice>("/v2/invoicing/invoices", {
      method: "POST",
      headers: { Prefer: "return=representation", "PayPal-Request-Id": requestId },
      body: body(true),
    });
  } catch (err) {
    // If PayPal ever rejects the business name, send the invoice without it
    // rather than fail the freelancer's invoice. The body differs, so the
    // retry has its own request id.
    if (!businessName || !(err instanceof PayPalError) || err.status !== 400) throw err;
    console.warn("[paypal] invoice rejected with business_name, retrying without it", err.message);
    draft = await paypal<PayPalInvoice>("/v2/invoicing/invoices", {
      method: "POST",
      headers: { Prefer: "return=representation", "PayPal-Request-Id": `${requestId}-plain` },
      body: body(false),
    });
  }

  // 4. Send it: PayPal emails the client a link to pay. (On the sandbox no
  //    real email is delivered.)
  await paypal(`/v2/invoicing/invoices/${draft.id}/send`, {
    method: "POST",
    headers: { "PayPal-Request-Id": `${requestId}-send` },
    body: { send_to_invoicer: false, send_to_recipient: true },
  });

  // 5. Read it back, so the card shows PayPal's own number and status.
  const sent = await getInvoice(draft.id);
  return { invoice: summarize(sent), payerUrl: payerViewUrl(draft.id) };
}

/**
 * One full invoice, including payments.transactions (each payment's date and
 * amount). encodeURIComponent stops an id from changing the URL path.
 */
export async function getInvoice(id: string): Promise<PayPalInvoice> {
  return paypal<PayPalInvoice>(`/v2/invoicing/invoices/${encodeURIComponent(id)}`);
}

/**
 * One page of invoices (PayPal allows up to 100 per page). The list can leave
 * out payment details, so lib/ledger.ts re-reads the paid ones.
 */
export async function listInvoices(pageSize = 20): Promise<PayPalInvoice[]> {
  const res = await paypal<{ items?: PayPalInvoice[] }>(
    `/v2/invoicing/invoices?page=1&page_size=${pageSize}&total_required=false`,
  );
  return res.items ?? [];
}

/** PayPal emails the client a reminder. Only reached through the Approve button. */
export async function sendReminder(reminder: ReminderProposal): Promise<void> {
  await paypal(`/v2/invoicing/invoices/${encodeURIComponent(reminder.invoice_id)}/remind`, {
    method: "POST",
    body: {
      subject: reminder.subject,
      note: reminder.note,
      send_to_invoicer: false,
      send_to_recipient: true,
    },
  });
}

// ---------- Webhooks ----------

// The five headers PayPal signs every webhook delivery with.
type WebhookHeaders = {
  authAlgo: string | null;
  certUrl: string | null;
  transmissionId: string | null;
  transmissionSig: string | null;
  transmissionTime: string | null;
};

/**
 * Asks PayPal whether a webhook really came from PayPal for our webhook id.
 * Returns false (never throws) when anything is missing or PayPal says no.
 */
export async function verifyWebhookSignature(
  headers: WebhookHeaders,
  event: unknown,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    console.error("[webhook] PAYPAL_WEBHOOK_ID is not set");
    return false;
  }
  // A delivery without all five headers can't be from PayPal.
  if (Object.values(headers).some((v) => !v)) return false;

  try {
    // Rather than check PayPal's certificate chain ourselves, send PayPal the
    // headers, our webhook id and the exact event; it answers SUCCESS or FAILURE.
    const res = await paypal<{ verification_status: string }>(
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: {
          auth_algo: headers.authAlgo,
          cert_url: headers.certUrl,
          transmission_id: headers.transmissionId,
          transmission_sig: headers.transmissionSig,
          transmission_time: headers.transmissionTime,
          webhook_id: webhookId,
          webhook_event: event,
        },
      },
    );
    return res.verification_status === "SUCCESS";
  } catch (err) {
    console.error("[webhook] verification call failed", err);
    return false;
  }
}
