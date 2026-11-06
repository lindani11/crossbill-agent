import { NextResponse } from "next/server";
import { getLedger, totals } from "@/lib/ledger";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only: the freelancer's invoices with USD and local-currency values, for the dashboard. */
export async function GET(req: Request) {
  if (!rateLimit(`ledger:${clientIp(req)}`, 30)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  try {
    const { currency, rows } = await getLedger(50);
    return NextResponse.json({ currency, rows, totals: totals(rows) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[ledger]", err);
    return NextResponse.json({ error: "Could not load invoices from PayPal." }, { status: 502 });
  }
}
