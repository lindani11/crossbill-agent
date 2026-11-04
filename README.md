# Crossbill

Crossbill is an AI agent for freelancers paid by overseas clients. Describe the job and it drafts a PayPal invoice, sends it once you approve, chases late payers, and records every payment in rand.

Built for the [PayPal AI Hackathon](https://paypalaihackathon.devpost.com/). Runs on the PayPal **sandbox** only.

## How it works

1. You describe a job in plain language: *"Invoice Sarah Lee (sarah@example.com) for 3 days at $250 a day plus $120 hosting setup."*
2. The AI agent turns it into a structured USD invoice and shows it as a card. Nothing is sent yet.
3. You tap **Approve & send**. Only then does the server create the invoice through the PayPal Invoicing API and send it to the client.
4. Ask *"Who owes me money?"* and the agent reads your invoices from PayPal. Ask it to chase a late payer and it drafts a reminder for you to approve.

The approval step is enforced in code: the AI can only read from PayPal and propose actions. Sending happens in separate routes that run only when you tap Approve.

## Tech

| Part | Choice |
| --- | --- |
| App | Next.js (App Router), TypeScript, Tailwind CSS |
| AI | Vercel AI SDK with tool calling; Groq (GPT-OSS 120B, free tier) as the main model, Google Gemini (free tier) as automatic fallback |
| PayPal | REST Invoicing v2 API: generate invoice number, create draft, send, list, remind (sandbox) |
| Safety | Human approval before any send, idempotent `PayPal-Request-Id` on create, per-IP rate limits |

## AI tools used and how

| Tool | What it does |
| --- | --- |
| Groq (GPT-OSS 120B) via Vercel AI SDK | Reads the freelancer's message, calls `propose_invoice`, `list_invoices` or `propose_reminder` |
| Google Gemini | Same role, used automatically if Groq fails or hits its free quota |

## Run it locally

Requirements: Node.js 20.9 or newer.

```bash
npm install
cp .env.example .env.local   # on Windows: copy .env.example .env.local
# fill in .env.local with your own keys
npm run dev
```

Open http://localhost:3000.

### Environment variables

| Variable | Where to get it |
| --- | --- |
| `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` | [PayPal Developer](https://developer.paypal.com/dashboard/applications/sandbox) > Apps & Credentials > Sandbox |
| `GOOGLE_GENERATIVE_AI_API_KEY` | [Google AI Studio](https://aistudio.google.com/apikey) (free) |
| `GROQ_API_KEY` | [Groq console](https://console.groq.com/keys) (free) |

## Testing it

Send an invoice to a PayPal **sandbox Personal** account email, then log in as that account at [sandbox.paypal.com](https://www.sandbox.paypal.com) to pay it.

Sandbox test buyer for judges: *(to be added)*

## License

[MIT](LICENSE)
