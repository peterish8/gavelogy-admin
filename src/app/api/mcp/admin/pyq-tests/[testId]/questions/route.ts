import { NextRequest } from "next/server";
import { handleAdminRead, handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation, mcpAdminQuery } from "@/app/api/mcp/admin/_lib/service";
import { ensureString, optionalNumber, optionalString } from "@/app/api/mcp/admin/_lib/validation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ testId: string }> },
) {
  return handleAdminRead(req, async () => {
    const { testId } = await params;
    const questions = await mcpAdminQuery<unknown[]>("listPyqQuestions", { testId });
    return jsonSuccess({ questions });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ testId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { testId } = await params;
    const body = await readJsonBody(req);
    const result = await mcpAdminMutation<{ questionId: string }>("createPyqQuestion", {
      testId,
      passage_id: optionalString(body.passage_id, "passage_id"),
      order_index: optionalNumber(body.order_index, "order_index"),
      question_text: ensureString(body.question_text, "question_text"),
      option_a: optionalString(body.option_a, "option_a"),
      option_b: optionalString(body.option_b, "option_b"),
      option_c: optionalString(body.option_c, "option_c"),
      option_d: optionalString(body.option_d, "option_d"),
      correct_answer: optionalString(body.correct_answer, "correct_answer"),
      explanation: optionalString(body.explanation, "explanation"),
      marks: optionalNumber(body.marks, "marks"),
      question_type: optionalString(body.question_type, "question_type"),
      subject: optionalString(body.subject, "subject"),
      source: "chatgpt-mcp",
    });
    return jsonSuccess({ questionId: result.questionId }, 201);
  });
}
