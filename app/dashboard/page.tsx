import type { Metadata } from "next";
import SiteHeader from "@/components/site-header";
import Receivables from "@/components/receivables";

export const metadata: Metadata = { title: "Dashboard · Crossbill" };

export default function DashboardPage() {
  return (
    <>
      <SiteHeader active="dashboard" />
      <main id="main" className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 pt-6 pb-10 sm:px-6">
        <div className="mb-5">
          <p className="ff-eyebrow">Receivables</p>
          <h1 className="on-canvas mt-1 text-3xl font-black tracking-tight">Who owes you, and what you&apos;ve earned</h1>
        </div>
        <Receivables />
      </main>
    </>
  );
}
