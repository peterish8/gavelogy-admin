import { ConvexHttpClient } from "convex/browser";

let httpClient: ConvexHttpClient | null = null;

export function getConvexClient() {
  if (typeof window === "undefined") {
    throw new Error("getConvexClient() can only be used in the browser");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { convex } = require("@/components/convex-provider");
  return convex;
}

export function getConvexHttpClient() {
  if (!httpClient) {
    httpClient = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  }
  return httpClient;
}
