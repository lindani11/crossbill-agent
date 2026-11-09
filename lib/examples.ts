/**
 * lib/examples.ts · The three example prompts: tutor, developer, translator
 *
 * Shown on the empty chat, and as buttons when the agent calls show_examples.
 * One per kind of freelancer, to show Crossbill works for any field. Each is
 * addressed to its own PayPal sandbox test client, so every example can be sent
 * and paid end to end; if that client is not in SANDBOX_TEST_EMAILS, another
 * listed test client is used instead.
 *
 * How it connects
 *   app/page.tsx → exampleRecipients() → <Chat> → buildExamples() (empty chat)
 *   lib/agent.ts → buildExamples(exampleRecipients()) → buttons under a reply
 *
 * The browser imports this file too, so it holds no secrets.
 */
export type Example = { who: string; text: string };

// Each prompt is a function of the email, so a different address can be swapped in.
const EXAMPLES: { who: string; email: string; text: (email: string) => string }[] = [
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
];

/**
 * The three prompts, each with an email that can really receive an invoice:
 * its own test client if listed, otherwise one of the listed ones in turn.
 */
export function buildExamples(testEmails: string[]): Example[] {
  return EXAMPLES.map((ex, i) => {
    const email =
      testEmails.length === 0 || testEmails.includes(ex.email) ? ex.email : testEmails[i % testEmails.length];
    return { who: ex.who, text: ex.text(email) };
  });
}
