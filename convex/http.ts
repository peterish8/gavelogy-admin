import { httpRouter } from "convex/server";
import { auth } from "./auth";

const http = httpRouter();

// Exposes the Convex Auth callback routes required for OAuth providers (Google)
// and magic-link / OTP flows.
auth.addHttpRoutes(http);

export default http;
