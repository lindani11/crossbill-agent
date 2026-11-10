/**
 * lib/examples.ts · The four example prompts: tutor, developer, translator,
 * and a question any freelancer asks
 *
 * Shown on the empty chat, and as buttons when the agent calls show_examples.
 * Three invoices, one per kind of freelancer, to show Crossbill works for any
 * field, and one question about the books. Each invoice is addressed to its own
 * PayPal sandbox test client, so every example can be sent and paid end to end;
 * if that client is not in SANDBOX_TEST_EMAILS, another listed test client is
 * used instead. The question needs no email.
 *
 * How it connects
 *   app/page.tsx → exampleRecipients() → <Chat> → buildExamples() (empty chat)
 *   lib/agent.ts → buildExamples(exampleRecipients()) → buttons under a reply
 *
 * The browser imports this file too, so it holds no secrets.
 */
export type Example = { who: string; text: string };

// Each invoice prompt is a function of the email, so a different address can be
// swapped in. An example without an email is a question, not an invoice.
const EXAMPLES: { who: string; email?: string; text: (email: string) => string }[] = [
  {
    who: "Tutor",
    email: "angelina@personal.example.com",
    text: (e) => `Invoice Angelina (${e}) for 8 online maths lessons at $20 each in October`,
  },
  {
    who: "Developer",
    email: "jacksmith@personal.example.com",
    text: (e) => `Invoice Jack Smith (${e}) for 3 days of Next.js work at $250 a day plus $120 for hosting setup`,
  },
  {
    who: "Translator",
    email: "ngwenyaholdings@personal.example.com",
    text: (e) => `Invoice Ngwenya Holdings (${e}) for translating 4,500 words from English to isiZulu at $0.08 a word`,
  },
  {
    who: "Any freelancer",
    text: () => "Who owes me, and who has paid?",
  },
];

/**
 * The four prompts. Each invoice gets an email that can really receive it:
 * its own test client if listed, otherwise one of the listed ones in turn.
 */
export function buildExamples(testEmails: string[]): Example[] {
  return EXAMPLES.map((ex, i) => {
    if (!ex.email) return { who: ex.who, text: ex.text("") };
    const email =
      testEmails.length === 0 || testEmails.includes(ex.email) ? ex.email : testEmails[i % testEmails.length];
    return { who: ex.who, text: ex.text(email) };
  });
}
