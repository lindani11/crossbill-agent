import type { MetadataRoute } from "next";

/**
 * app/manifest.ts · The web app manifest, served at /manifest.webmanifest
 *
 * Lets phones and computers install Crossbill as an app: its name, colours,
 * start page and icons. The "maskable" icon has extra padding, because Android
 * crops it into its own shape (circle, squircle...).
 */

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Crossbill",
    short_name: "Crossbill",
    description: "Describe the job. Approve. Get paid. Your tax books keep themselves.",
    start_url: "/",
    // Opens in its own window, without the browser's address bar.
    display: "standalone",
    background_color: "#ebe3d2",
    theme_color: "#ffffff",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
