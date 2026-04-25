import { NextResponse } from "next/server";

const BODY = {
  error: "Legacy MCP endpoint is disabled",
  code: "MCP_ROUTE_DISABLED",
  message:
    "Use /api/mcp/admin/* allowlisted routes for create/read/update/publish workflows. Deletion is manual in Gavelogy admin UI only.",
};

export async function GET() {
  return NextResponse.json(BODY, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST() {
  return NextResponse.json(BODY, {
    status: 410,
    headers: { "Cache-Control": "no-store" },
  });
}
