import "server-only";
import { IS_SANDBOX } from "./paypal";

/**
 * lib/recipients.ts · Who may receive invoices and reminders
 *
 * PayPal has no API that says whether an email belongs to a PayPal account, so
 * on the sandbox Crossbill only sends to the test client accounts listed in
 * SANDBOX_TEST_EMAILS (comma-separated). Anything else would sit unpaid forever
 * and distort the books. In live mode any address is allowed.
 *
 * How it connects (checked when drafting AND when approving)
 *   lib/agent.ts propose_invoice → checkRecipient() → no card if refused
 *   app/api/invoices/send        → checkRecipient() → 403 if refused
 *   app/api/invoices/remind      → checkRecipient(the email PayPal has on file)
 *   app/page.tsx                 → exampleRecipients() → the example prompts
 */

// Plain-language errors: the agent passes them on to the freelancer as they are.
const RECIPIENT_NOT_ALLOWED =
  "This demo runs on the PayPal sandbox, so invoices can only go to its test client accounts. Use one of the test client emails in the examples or the README.";

const NONE_SET_UP =
  "No PayPal sandbox test client accounts are set up yet (SANDBOX_TEST_EMAILS), so nothing can be sent.";

/** The sandbox test client emails, lower-cased. */
function sandboxTestEmails(): string[] {
  return (process.env.SANDBOX_TEST_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Emails the chat examples should use: the sandbox test clients, or none in live mode. */
export function exampleRecipients(): string[] {
  return IS_SANDBOX ? sandboxTestEmails() : [];
}

// A result instead of an exception, so each caller decides how to answer.
type RecipientCheck = { ok: true } | { ok: false; error: string };

/** Allowed or not, with a message to show. Emails are compared trimmed and lower-cased. */
export function checkRecipient(email: string | null | undefined): RecipientCheck {
  if (!IS_SANDBOX) return { ok: true };
  const allowed = sandboxTestEmails();
  // Fail closed: with no list configured, nothing can be sent.
  if (allowed.length === 0) return { ok: false, error: NONE_SET_UP };
  if (email && allowed.includes(email.trim().toLowerCase())) return { ok: true };
  return { ok: false, error: RECIPIENT_NOT_ALLOWED };
}
