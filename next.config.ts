import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const configDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: configDir,
  },
  // Note: ignoreBuildErrors was removed; TypeScript errors must be fixed, not suppressed.
  // They can prevent runtime crashes that are invisible in development.
  experimental: {
    serverActions: {
      // 2MB is sufficient for Server Actions; file uploads use the /api/judgment/upload route directly.
      bodySizeLimit: "2mb",
    },
  },
  // Tell Next.js not to bundle these packages. They must be loaded from
  // node_modules at runtime on Vercel so native bindings and file-system
  // reads (pdf-parse's test-file check) resolve correctly.
  serverExternalPackages: ["pdf-parse"],

  // Security headers (XSS prevention and hardening).
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent your site from being embedded in iframes (clickjacking protection)
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Only send origin in Referer header for same-site requests
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Disable unused browser features
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
