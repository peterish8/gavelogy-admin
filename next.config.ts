import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  // Tell Next.js not to bundle these packages — they must be loaded from
  // node_modules at runtime on Vercel so native bindings and file-system
  // reads (pdf-parse's test-file check) resolve correctly.
  serverExternalPackages: ['pdf-parse'],
};

export default nextConfig;
