import { NextRequest } from "next/server";
import { handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { ApiError, jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation } from "@/app/api/mcp/admin/_lib/service";
import { optionalNumber, optionalString } from "@/app/api/mcp/admin/_lib/validation";

const PATCH_FIELDS = ["title", "description", "subject_id", "order_index"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ quizId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { quizId } = await params;
    const body = await readJsonBody(req);
    const patch: Record<string, unknown> = {
      title: optionalString(body.title, "title"),
      description: optionalString(body.description, "description"),
      subject_id: optionalString(body.subject_id, "subject_id"),
      order_index: optionalNumber(body.order_index, "order_index"),
    };
    const hasAnyPatch = PATCH_FIELDS.some((field) => patch[field] !== undefined);
    if (!hasAnyPatch) {
      throw new ApiError(400, "BAD_REQUEST", "No allowlisted standalone quiz fields provided");
    }
    await mcpAdminMutation("updateStandaloneQuiz", {
      quizId,
      patch,
      source: "chatgpt-mcp",
    });
    return jsonSuccess({ quizId, updated: true });
  });
}
