import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Crossbill",
    short_name: "Crossbill",
    description: "Invoice overseas clients through PayPal by chatting.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f4",
    theme_color: "#0f7b5f",
  };
}
