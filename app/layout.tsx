import type { Metadata, Viewport } from "next";
import "./globals.css";
import SiteFooter from "@/components/site-footer";
import Splash from "@/components/splash";
import ServiceWorker from "@/components/service-worker";

export const metadata: Metadata = {
  title: "Crossbill",
  description:
    "AI agent for freelancers paid by overseas clients: drafts PayPal invoices, sends after your approval, chases late payers.",
  applicationName: "Crossbill",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        <Splash />
        <ServiceWorker />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
