import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Crossbill",
    short_name: "Crossbill",
    description: "Describe the job. Approve. Get paid. Your tax books keep themselves.",
    start_url: "/",
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
