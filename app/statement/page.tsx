import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import StatementView from "@/components/statement-view";
import { isIsoDate } from "@/lib/money";

/**
 * app/statement/page.tsx · "/statement", the tax-ready income statement
 *
 * Reads ?from=&to= on the server and passes them on only if both are real
 * dates in order; otherwise the statement opens on this tax year.
 *
 *   <SiteHeader> → <StatementView> (components/statement-view.tsx)
 *     → GET /api/statement → tables, plus PDF and CSV downloads
 */

export const metadata: Metadata = { title: "Income statement · Crossbill" };

export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  // Since Next.js 15, searchParams is a Promise.
  const { from, to } = await searchParams;
  const valid = isIsoDate(from) && isIsoDate(to) && from <= to;
  return (
    <>
      <SiteHeader active="statement" />
      <main id="main" className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 pt-6 pb-10 sm:px-6">
        <StatementView initialFrom={valid ? from : undefined} initialTo={valid ? to : undefined} />
      </main>
    </>
  );
}
