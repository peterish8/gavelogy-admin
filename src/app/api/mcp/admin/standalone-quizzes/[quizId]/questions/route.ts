import { NextRequest } from "next/server";
import { handleAdminRead, handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation, mcpAdminQuery } from "@/app/api/mcp/admin/_lib/service";
import { ensureString, optionalNumber, optionalString } from "@/app/api/mcp/admin/_lib/validation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ quizId: string }> },
) {
  return handleAdminRead(req, async () => {
    const { quizId } = await params;
    const questions = await mcpAdminQuery<unknown[]>("listStandaloneQuizQuestions", { quizId });
    return jsonSuccess({ questions });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ quizId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { quizId } = await params;
    const body = await readJsonBody(req);
    const result = await mcpAdminMutation<{ questionId: string }>("createStandaloneQuestion", {
      quizId,
      question_text: ensureString(body.question_text, "question_text"),
      option_a: optionalString(body.option_a, "option_a"),
      option_b: optionalString(body.option_b, "option_b"),
      option_c: optionalString(body.option_c, "option_c"),
      option_d: optionalString(body.option_d, "option_d"),
      correct_answer: ensureString(body.correct_answer, "correct_answer"),
      explanation: optionalString(body.explanation, "explanation"),
      order_index: optionalNumber(body.order_index, "order_index"),
      source: "chatgpt-mcp",
    });
    return jsonSuccess({ questionId: result.questionId }, 201);
  });
}
