import { NextResponse } from "next/server";
import { buildStatement, defaultPeriod, statementCsv } from "@/lib/statement";
import { statementPdf } from "@/lib/statement-pdf";
import { formatDate, isIsoDate, saTaxYear, type Period } from "@/lib/money";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/**
 * GET /api/statement · The income statement as JSON, CSV or PDF (read-only)
 *
 *   ?from=YYYY-MM-DD&to=YYYY-MM-DD   both dates, or neither for this tax year
 *   &format=pdf → lib/statement-pdf.ts · &format=csv → statementCsv() · else JSON
 *
 *   components/statement-view.tsx → JSON, and the Download PDF / CSV links
 */

// Node.js runtime: the PayPal client uses Node's Buffer.
export const runtime = "nodejs";
// Never pre-render or cache this route: the statement must be live.
export const dynamic = "force-dynamic";

/**
 * The period in the URL: both dates or neither (this tax year), else null for
 * a 400. A range that is exactly a tax year keeps the tax-year label.
 */
function periodFrom(url: URL): Period | null {
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from && !to) return defaultPeriod();
  if (!isIsoDate(from) || !isIsoDate(to) || from > to) return null;
  const tax = saTaxYear(Number(from.slice(0, 4)) + 1);
  if (tax.from === from && tax.to === to) return tax;
  return { from, to, label: `${formatDate(from)} to ${formatDate(to)}` };
}

/**
 * Read-only income statement. JSON for the Statement page and the agent;
 * `?format=csv` downloads it as a spreadsheet file, `?format=pdf` as a PDF.
 */
export async function GET(req: Request) {
  if (!rateLimit(`statement:${clientIp(req)}`, 30)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }
  const url = new URL(req.url);
  const period = periodFrom(url);
  if (!period) {
    return NextResponse.json({ error: "Use from and to as YYYY-MM-DD, with from on or before to." }, { status: 400 });
  }

  try {
    const st = await buildStatement(period);
    if (url.searchParams.get("format") === "pdf") {
      const pdf = await statementPdf(st);
      // Copy exactly the PDF's bytes into an ArrayBuffer, a body type Response accepts.
      const body = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
      return new Response(body, {
        headers: {
          "Content-Type": "application/pdf",
          // "attachment" makes the browser download the file rather than open it.
          "Content-Disposition": `attachment; filename="crossbill-income-${period.from}-to-${period.to}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (url.searchParams.get("format") === "csv") {
      const name = `crossbill-income-${period.from}-to-${period.to}.csv`;
      return new Response(statementCsv(st), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${name}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(st, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[statement]", err);
    return NextResponse.json({ error: "Could not build the statement from PayPal." }, { status: 502 });
  }
}
