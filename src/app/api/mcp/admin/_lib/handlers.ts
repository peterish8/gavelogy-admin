import { NextRequest, NextResponse } from "next/server";
import { enforcePayloadSize, requireAdminAccess, requireWriteSecret } from "./auth";
import { fromUnknownError, ApiError } from "./response";
import { unauthorizedResponse } from "@/lib/admin-auth";

export async function handleAdminRead(
  req: NextRequest,
  handler: () => Promise<NextResponse>,
) {
  try {
    await requireAdminAccess(req);
    return await handler();
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
      return unauthorizedResponse();
    }
    return fromUnknownError(error);
  }
}

export async function handleAdminWrite(
  req: NextRequest,
  handler: () => Promise<NextResponse>,
  maxBytes = 500_000,
) {
  try {
    await requireAdminAccess(req);
    requireWriteSecret(req);
    enforcePayloadSize(req, maxBytes);
    return await handler();
  } catch (error) {
    if (error instanceof ApiError && error.code === "UNAUTHORIZED") {
      return unauthorizedResponse();
    }
    return fromUnknownError(error);
  }
}

export async function readJsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "BAD_REQUEST", "Request body must be an object");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "BAD_REQUEST", "Invalid JSON body");
  }
}
