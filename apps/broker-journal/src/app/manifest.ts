import type { MetadataRoute } from "next";

const basePath = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Журнал брокера",
    short_name: "Брокер",
    description: "Журнал открытий и закрытий фьючерсов",
    // Standalone PWA starts at journal root (with optional portal basePath)
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: "standalone",
    background_color: "#faf8f4",
    theme_color: "#1f7a54",
    lang: "ru",
    icons: [
      {
        src: `${basePath}/icons/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/icons/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${basePath}/icons/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
