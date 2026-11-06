import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import StatementView from "@/components/statement-view";
import { isIsoDate } from "@/lib/money";

export const metadata: Metadata = { title: "Income statement · Crossbill" };

export default async function StatementPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const { from, to } = await searchParams;
  const valid = isIsoDate(from) && isIsoDate(to) && from <= to;
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pb-8">
      <SiteHeader active="statement" />
      <StatementView initialFrom={valid ? from : undefined} initialTo={valid ? to : undefined} />
    </main>
  );
}
