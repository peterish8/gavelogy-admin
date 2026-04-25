import { NextRequest } from "next/server";
import { handleAdminRead, handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { ApiError, jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation, mcpAdminQuery } from "@/app/api/mcp/admin/_lib/service";
import { ensureArray, ensureObject, optionalString } from "@/app/api/mcp/admin/_lib/validation";

export async function GET(req: NextRequest) {
  return handleAdminRead(req, async () => {
    const date = req.nextUrl.searchParams.get("date") ?? undefined;
    const status = req.nextUrl.searchParams.get("status") ?? undefined;
    const category = req.nextUrl.searchParams.get("category") ?? undefined;
    const subject = req.nextUrl.searchParams.get("subject") ?? undefined;

    const rows = await mcpAdminQuery<unknown[]>("listDailyNews", {
      date,
      status,
      category,
      subject,
    });
    return jsonSuccess({ rows });
  });
}

export async function POST(req: NextRequest) {
  return handleAdminWrite(req, async () => {
    const body = await readJsonBody(req);
    const rows = ensureArray(body.rows, "rows").map((entry, index) => {
      const row = ensureObject(entry, `rows[${index}]`);
      if (typeof row.date !== "string" || row.date.trim() === "") {
        throw new ApiError(400, "BAD_REQUEST", `rows[${index}].date is required`);
      }
      return row;
    });

    const result = await mcpAdminMutation<{ ids: string[] }>("createDailyNewsRows", {
      rows,
      source: optionalString(body.source, "source") ?? "chatgpt-mcp",
    });
    return jsonSuccess({ ids: result.ids }, 201);
  }, 1_000_000);
}
