import "server-only";
import { IS_SANDBOX } from "./paypal";

/**
 * Who may receive invoices and reminders.
 *
 * PayPal has no API that says whether an email belongs to a PayPal account,
 * so on the sandbox Crossbill only sends to the test client accounts listed
 * in SANDBOX_TEST_EMAILS (comma-separated). Anything else would sit unpaid
 * forever and distort the books. In live mode any address is allowed.
 * Enforced in the send and remind routes, not just in the prompt.
 */

export const RECIPIENT_NOT_ALLOWED =
  "This demo runs on the PayPal sandbox, so invoices can only go to its test client accounts. Use one of the test client emails in the examples or the README.";

const NONE_SET_UP =
  "No PayPal sandbox test client accounts are set up yet (SANDBOX_TEST_EMAILS), so nothing can be sent.";

/** The sandbox test client emails, lower-cased. */
export function sandboxTestEmails(): string[] {
  return (process.env.SANDBOX_TEST_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Emails the chat examples should use: the sandbox test clients, or none in live mode. */
export function exampleRecipients(): string[] {
  return IS_SANDBOX ? sandboxTestEmails() : [];
}

export type RecipientCheck = { ok: true } | { ok: false; error: string };

export function checkRecipient(email: string | null | undefined): RecipientCheck {
  if (!IS_SANDBOX) return { ok: true };
  const allowed = sandboxTestEmails();
  if (allowed.length === 0) return { ok: false, error: NONE_SET_UP };
  if (email && allowed.includes(email.trim().toLowerCase())) return { ok: true };
  return { ok: false, error: RECIPIENT_NOT_ALLOWED };
}
