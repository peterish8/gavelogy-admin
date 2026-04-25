import { NextRequest } from "next/server";
import { handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { ApiError, jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation } from "@/app/api/mcp/admin/_lib/service";
import { optionalNumber, optionalString } from "@/app/api/mcp/admin/_lib/validation";

const PATCH_FIELDS = [
  "passage_id",
  "order_index",
  "question_text",
  "option_a",
  "option_b",
  "option_c",
  "option_d",
  "correct_answer",
  "explanation",
  "marks",
  "question_type",
  "subject",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ questionId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { questionId } = await params;
    const body = await readJsonBody(req);
    const patch: Record<string, unknown> = {
      passage_id: body.passage_id === null ? null : optionalString(body.passage_id, "passage_id"),
      order_index: optionalNumber(body.order_index, "order_index"),
      question_text: optionalString(body.question_text, "question_text"),
      option_a: optionalString(body.option_a, "option_a"),
      option_b: optionalString(body.option_b, "option_b"),
      option_c: optionalString(body.option_c, "option_c"),
      option_d: optionalString(body.option_d, "option_d"),
      correct_answer: optionalString(body.correct_answer, "correct_answer"),
      explanation: optionalString(body.explanation, "explanation"),
      marks: optionalNumber(body.marks, "marks"),
      question_type: optionalString(body.question_type, "question_type"),
      subject: optionalString(body.subject, "subject"),
    };
    const hasAnyPatch = PATCH_FIELDS.some((field) => patch[field] !== undefined);
    if (!hasAnyPatch) {
      throw new ApiError(400, "BAD_REQUEST", "No allowlisted PYQ question fields provided");
    }
    await mcpAdminMutation("updatePyqQuestion", {
      questionId,
      patch,
      source: "chatgpt-mcp",
    });
    return jsonSuccess({ questionId, updated: true });
  });
}
