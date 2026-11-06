import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import Receivables from "@/components/receivables";

export const metadata: Metadata = { title: "Dashboard · Crossbill" };

export default function DashboardPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-8">
      <SiteHeader active="dashboard" />
      <Receivables />
    </main>
  );
}
