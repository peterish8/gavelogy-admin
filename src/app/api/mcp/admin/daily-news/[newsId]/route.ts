import { NextRequest } from "next/server";
import { handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { ApiError, jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation } from "@/app/api/mcp/admin/_lib/service";
import { optionalString } from "@/app/api/mcp/admin/_lib/validation";

const DAILY_NEWS_FIELDS = [
  "date",
  "title",
  "content_custom",
  "content_html",
  "summary",
  "keywords",
  "category",
  "source_paper",
  "status",
  "display_order",
  "subject",
  "topic",
  "court",
  "priority",
  "exam_probability",
  "capsule",
  "facts",
  "provisions",
  "holdings",
  "doctrine",
  "mcqs",
  "source_url",
  "read_seconds",
  "exam_rank",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ newsId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { newsId } = await params;
    const body = await readJsonBody(req);
    const patch: Record<string, unknown> = {};
    for (const field of DAILY_NEWS_FIELDS) {
      if (body[field] !== undefined) patch[field] = body[field];
    }
    if (Object.keys(patch).length === 0) {
      throw new ApiError(400, "BAD_REQUEST", "No allowlisted daily news fields provided");
    }
    await mcpAdminMutation("updateDailyNewsRow", {
      newsId,
      patch,
      source: optionalString(body.source, "source") ?? "chatgpt-mcp",
    });
    return jsonSuccess({ newsId, updated: true });
  }, 1_000_000);
}
