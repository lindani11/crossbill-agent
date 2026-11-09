import type { Metadata, Viewport } from "next";
import "./globals.css";
import SiteFooter from "@/components/site-footer";
import Splash from "@/components/splash";
import ServiceWorker from "@/components/service-worker";

/**
 * app/layout.tsx · The root layout that wraps every page
 *
 *   <html> → <body>
 *     <Splash>         landing animation on a full load (components/splash.tsx)
 *     <ServiceWorker>  registers /sw.js for the offline page
 *     {children}       the page: Chat (/), Dashboard or Statement
 *     <SiteFooter>
 */

// The <title>, description and app name used by browsers and link previews.
export const metadata: Metadata = {
  title: "Crossbill",
  description:
    "AI agent for freelancers paid by overseas clients: drafts PayPal invoices, sends after your approval, chases late payers.",
  applicationName: "Crossbill",
};

// Phone-width layout; themeColor tints the browser bar to match the white header.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col">
        {/* A full-height column, so the footer sits at the bottom of short pages. */}
        <Splash />
        <ServiceWorker />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
