import { NextResponse } from "next/server";
import { runAgent } from "@/lib/agent";
import { chatRequestSchema } from "@/lib/schemas";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!rateLimit(`chat:${clientIp(req)}`)) {
    return NextResponse.json(
      { error: "Too many requests. Please wait a few minutes and try again." },
      { status: 429 },
    );
  }

  const parsed = chatRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const messages = parsed.data.messages.map((m) =>
      m.role === "user"
        ? { role: "user" as const, content: m.content }
        : { role: "assistant" as const, content: m.content },
    );
    const result = await runAgent(messages);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[chat]", err);
    return NextResponse.json(
      { error: "The assistant is unavailable right now. Please try again shortly." },
      { status: 502 },
    );
  }
}
