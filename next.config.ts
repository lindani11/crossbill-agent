import type { NextConfig } from "next";

/**
 * next.config.ts · Next.js settings: security headers on every response
 *
 * The content security policy (CSP) allows only this site's own scripts,
 * styles and API calls ('unsafe-inline' is needed for the scripts Next.js
 * inlines into static pages). PayPal pages open in a new tab, so they are not
 * affected. The AI, PayPal and exchange-rate calls all run on the server,
 * which is why connect-src can stay 'self'.
 */
const dev = process.env.NODE_ENV === "development";

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      // Anything not listed below: this site only.
      "default-src 'self'",
      // Development only: Next.js hot reload needs eval and a websocket.
      `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
      // Tailwind, AG Grid and AG Studio set some styles inline.
      "style-src 'self' 'unsafe-inline'",
      // data: and blob: URLs for inline images and generated charts.
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      // fetch() may only reach this site's own /api routes (plus hot reload in dev).
      `connect-src 'self'${dev ? " ws: wss:" : ""}`,
      // The service worker, and workers that libraries start from blob: URLs.
      "worker-src 'self' blob:",
      // No plugins (<object>, <embed>).
      "object-src 'none'",
      // A <base> tag can't point relative links at another site.
      "base-uri 'self'",
      // Forms can only submit to this site.
      "form-action 'self'",
      // No site may show Crossbill inside a frame (stops clickjacking).
      "frame-ancestors 'none'",
    ].join("; "),
  },
  // Browsers must use the declared content type (no MIME sniffing).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // The older way to forbid framing, for older browsers.
  { key: "X-Frame-Options", value: "DENY" },
  // Other sites see only the origin, never full paths and query strings.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Switch off device features Crossbill never uses.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // HTTPS only, for two years, subdomains included.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // Don't announce "X-Powered-By: Next.js".
  poweredByHeader: false,
  async headers() {
    // Every path gets the headers.
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
