import { NextRequest } from "next/server";
import { handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { ApiError, jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation } from "@/app/api/mcp/admin/_lib/service";
import { optionalBoolean, optionalNumber, optionalString } from "@/app/api/mcp/admin/_lib/validation";

const PATCH_FIELDS = [
  "title",
  "exam_name",
  "year",
  "duration_minutes",
  "total_marks",
  "negative_marking",
  "instructions",
  "is_published",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ testId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { testId } = await params;
    const body = await readJsonBody(req);
    const patch: Record<string, unknown> = {
      title: optionalString(body.title, "title"),
      exam_name: optionalString(body.exam_name, "exam_name"),
      year: optionalNumber(body.year, "year"),
      duration_minutes: optionalNumber(body.duration_minutes, "duration_minutes"),
      total_marks: optionalNumber(body.total_marks, "total_marks"),
      negative_marking: optionalNumber(body.negative_marking, "negative_marking"),
      instructions: optionalString(body.instructions, "instructions"),
      is_published: optionalBoolean(body.is_published, "is_published"),
    };
    const hasAnyPatch = PATCH_FIELDS.some((field) => patch[field] !== undefined);
    if (!hasAnyPatch) {
      throw new ApiError(400, "BAD_REQUEST", "No allowlisted PYQ test fields provided");
    }
    await mcpAdminMutation("updatePyqTest", {
      testId,
      patch,
      source: "chatgpt-mcp",
    });
    return jsonSuccess({ testId, updated: true });
  });
}
