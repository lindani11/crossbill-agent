import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { chatRequestSchema } from "@/lib/schemas";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/**
 * POST /api/chat · One turn of the conversation with the agent
 *
 *   components/chat.tsx → rate limit → zod check → lib/agent.ts runAgent()
 *     ← { text, proposals, suggestions, provider }, or { error }
 *
 * Read-only by design: the agent can only propose. Sending happens in
 * /api/invoices/send and /api/invoices/remind, after the freelancer approves.
 */

// Node.js, not the Edge runtime: the PayPal client uses Node's Buffer.
export const runtime = "nodejs";
// Up to 60 s on Vercel: one turn can take several model and tool steps.
export const maxDuration = 60;

export async function POST(req: Request) {
  // 20 messages per 10 minutes per IP keeps the free AI quota for everyone.
  if (!rateLimit(`chat:${clientIp(req)}`)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  // Broken or missing JSON becomes null and fails the check (a 400), never a crash.
  const parsed = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    // Rebuild each message with only its role and content, typed for the AI SDK.
    const messages = parsed.data.messages.map((m) =>
      m.role === "user"
        ? { role: "user" as const, content: m.content }
        : { role: "assistant" as const, content: m.content },
    );
    const result = await runAgent(messages);
    return NextResponse.json(result);
  } catch (err) {
    // The details go to the server log; the browser gets a plain message.
    console.error("[chat]", err);
    return NextResponse.json(
      { error: "The assistant is unavailable right now. Please try again shortly." },
      { status: 502 },
    );
  }
}
