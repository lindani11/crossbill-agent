import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatDate, formatMonth } from "./money";
import type { Statement } from "./statement";

/**
 * The income statement as a ready-made A4 PDF, built on the server. Unlike the
 * browser's print dialog, this never depends on the printer being reachable.
 */

const A4: [number, number] = [595.28, 841.89];
const MARGIN = 42;
const INK = rgb(0.067, 0.094, 0.153);
const MUTED = rgb(0.35, 0.38, 0.43);
const BLUE = rgb(0.012, 0.412, 0.631);
const RULE = rgb(0.8, 0.84, 0.88);
const HEAD_BG = rgb(0.969, 0.949, 0.91);

const DIGITS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Plain-ASCII money so the standard PDF fonts can draw every currency. */
function money(value: number | null, currency: string): string {
  if (value === null) return "-";
  if (currency === "ZAR") return `R${DIGITS.format(value)}`;
  if (currency === "USD") return `$${DIGITS.format(value)}`;
  return `${currency} ${DIGITS.format(value)}`;
}

/** Keep only characters the standard (WinAnsi) fonts can encode. */
function safe(text: string | null | undefined): string {
  return (text ?? "")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safe(text).split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function fit(text: string, font: PDFFont, size: number, width: number): string {
  let t = safe(text);
  if (font.widthOfTextAtSize(t, size) <= width) return t;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}...`, size) > width) t = t.slice(0, -1);
  return `${t}...`;
}

type Column = { title: string; width: number; align?: "right" };

export async function statementPdf(st: Statement): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Income statement ${st.period.from} to ${st.period.to}`);
  doc.setAuthor(st.business ?? "Crossbill");
  doc.setCreator("Crossbill");
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const cur = st.currency;
  const contentWidth = A4[0] - MARGIN * 2;

  let page: PDFPage = doc.addPage(A4);
  let y = A4[1] - MARGIN;

  const text = (s: string, x: number, size: number, font = regular, color = INK) =>
    page.drawText(safe(s), { x, y, size, font, color });

  const newPage = () => {
    page = doc.addPage(A4);
    y = A4[1] - MARGIN;
  };

  const ensure = (height: number) => {
    if (y - height < MARGIN + 24) newPage();
  };

  const table = (columns: Column[], rows: string[][], boldLast = false) => {
    const header = () => {
      ensure(40);
      page.drawRectangle({ x: MARGIN, y: y - 6, width: contentWidth, height: 20, color: HEAD_BG });
      let x = MARGIN + 6;
      for (const c of columns) {
        const label = fit(c.title.toUpperCase(), bold, 7.5, c.width - 8);
        const w = bold.widthOfTextAtSize(label, 7.5);
        page.drawText(label, { x: c.align === "right" ? x + c.width - 8 - w : x, y, size: 7.5, font: bold, color: INK });
        x += c.width;
      }
      y -= 20;
    };
    header();
    rows.forEach((row, r) => {
      if (y - 18 < MARGIN + 24) {
        newPage();
        header();
      }
      const isTotal = boldLast && r === rows.length - 1;
      const font = isTotal ? bold : regular;
      let x = MARGIN + 6;
      row.forEach((cell, i) => {
        const c = columns[i];
        const value = fit(cell, font, 9, c.width - 8);
        const w = font.widthOfTextAtSize(value, 9);
        page.drawText(value, { x: c.align === "right" ? x + c.width - 8 - w : x, y, size: 9, font, color: INK });
        x += c.width;
      });
      page.drawLine({
        start: { x: MARGIN, y: y - 6 },
        end: { x: MARGIN + contentWidth, y: y - 6 },
        thickness: isTotal ? 1 : 0.5,
        color: isTotal ? INK : RULE,
      });
      y -= 18;
    });
    y -= 10;
  };

  // Title block
  text("INCOME STATEMENT", MARGIN, 9, bold, BLUE);
  y -= 22;
  text(st.business ?? "Freelance income", MARGIN, 18, bold);
  y -= 18;
  text(st.period.label, MARGIN, 10.5);
  y -= 14;
  text(
    `Payments received through PayPal, in USD and ${cur} at each payment day's exchange rate. Generated ${formatDate(st.generated_at)}.`,
    MARGIN,
    8.5,
    regular,
    MUTED,
  );
  y -= 26;

  // Summary
  const summary: [string, string][] = [
    ["Payments", String(st.totals.payments)],
    ["Total in USD", money(st.totals.usd, "USD")],
    [`Total in ${cur}`, money(st.totals.local, cur)],
    ["Average rate", st.totals.average_rate ? `${st.totals.average_rate.toFixed(4)} ${cur}/USD` : "-"],
  ];
  const boxW = contentWidth / 4;
  summary.forEach(([label, value], i) => {
    const x = MARGIN + i * boxW;
    page.drawRectangle({ x: x + 2, y: y - 30, width: boxW - 4, height: 44, borderColor: BLUE, borderWidth: i === 2 ? 1.5 : 0.75 });
    page.drawText(safe(label.toUpperCase()), { x: x + 10, y: y, size: 7, font: bold, color: BLUE });
    page.drawText(fit(value, bold, 12, boxW - 20), { x: x + 10, y: y - 20, size: 12, font: bold, color: i === 2 ? BLUE : INK });
  });
  y -= 58;

  if (st.totals.missing_rates > 0) {
    text(`${st.totals.missing_rates} payment(s) had no exchange rate yet and are left out of the ${cur} total.`, MARGIN, 8.5, regular, MUTED);
    y -= 18;
  }

  if (st.payments.length === 0) {
    text("No payments were received in this period.", MARGIN, 10);
    y -= 24;
  } else {
    text("By month", MARGIN, 11, bold);
    y -= 18;
    table(
      [
        { title: "Month", width: contentWidth * 0.34 },
        { title: "Payments", width: contentWidth * 0.18, align: "right" },
        { title: "USD", width: contentWidth * 0.24, align: "right" },
        { title: cur, width: contentWidth * 0.24, align: "right" },
      ],
      [
        ...st.months.map((m) => [formatMonth(m.month), String(m.payments), money(m.usd, "USD"), money(m.local, cur)]),
        ["Total", String(st.totals.payments), money(st.totals.usd, "USD"), money(st.totals.local, cur)],
      ],
      true,
    );

    ensure(60);
    text("Every payment", MARGIN, 11, bold);
    y -= 18;
    table(
      [
        { title: "Date paid", width: contentWidth * 0.14 },
        { title: "Invoice", width: contentWidth * 0.1 },
        { title: "Client", width: contentWidth * 0.24 },
        { title: "USD", width: contentWidth * 0.13, align: "right" },
        { title: `USD/${cur}`, width: contentWidth * 0.12, align: "right" },
        { title: "Rate date", width: contentWidth * 0.13 },
        { title: cur, width: contentWidth * 0.14, align: "right" },
      ],
      [
        ...st.payments.map((p) => [
          formatDate(p.paid_on),
          p.invoice_number ? `#${p.invoice_number}` : "",
          p.client ?? "",
          money(p.amount_usd, "USD"),
          p.fx_rate ? p.fx_rate.toFixed(4) : "-",
          p.fx_date ? formatDate(p.fx_date) : "-",
          money(p.amount_local, cur),
        ]),
        ["Total", "", "", money(st.totals.usd, "USD"), "", "", money(st.totals.local, cur)],
      ],
      true,
    );
  }

  // Method note
  const noteLines = wrap(st.method, regular, 8.5, contentWidth);
  const sources = st.rate_sources.length ? st.rate_sources.join("; ") : "none needed";
  const sourceLines = wrap(`Rates: ${sources}. Demo data from the PayPal sandbox.`, regular, 8, contentWidth);
  ensure(30 + (noteLines.length + sourceLines.length) * 12);
  text("How the values are worked out", MARGIN, 10, bold);
  y -= 15;
  for (const line of noteLines) {
    text(line, MARGIN, 8.5, regular, MUTED);
    y -= 12;
  }
  y -= 4;
  for (const line of sourceLines) {
    text(line, MARGIN, 8, regular, MUTED);
    y -= 11;
  }

  // Page numbers
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const label = `Crossbill · page ${i + 1} of ${pages.length}`.replace("·", "-");
    const w = regular.widthOfTextAtSize(label, 7.5);
    p.drawText(label, { x: A4[0] - MARGIN - w, y: MARGIN - 18, size: 7.5, font: regular, color: MUTED });
  });

  return doc.save();
}
