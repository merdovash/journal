import type { NextConfig } from "next";
import withPWAInit from "@ducanh2912/next-pwa";

/**
 * Optional mount under portal path, e.g. NEXT_PUBLIC_BASE_PATH=/broker
 * When reverse-proxied from project_hub at /broker/*, set the same basePath
 * on the journal so asset URLs and routes align.
 */
const rawBasePath = process.env.NEXT_PUBLIC_BASE_PATH?.trim() || "";
const basePath =
  rawBasePath && rawBasePath !== "/"
    ? rawBasePath.startsWith("/")
      ? rawBasePath.replace(/\/$/, "")
      : `/${rawBasePath.replace(/\/$/, "")}`
    : "";

const assetPrefix =
  process.env.NEXT_PUBLIC_ASSET_PREFIX?.trim() || undefined;

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  // Fallback must respect basePath when embedded under portal
  fallbacks: {
    document: basePath || "/",
  },
  // Scope SW to basePath so standalone + /broker mounts do not clash
  ...(basePath
    ? {
        scope: `${basePath}/`,
        sw: "sw.js",
      }
    : {}),
});

const nextConfig: NextConfig = {
  transpilePackages: ["@broker-journal/ui"],
  serverExternalPackages: ["tesseract.js", "tesseract.js-core", "sharp"],
  ...(basePath ? { basePath } : {}),
  ...(assetPrefix ? { assetPrefix } : {}),
  experimental: {
    optimizePackageImports: ["lucide-react", "@broker-journal/ui"],
  },
};

export default withPWA(nextConfig);
