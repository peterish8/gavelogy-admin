import { NextRequest } from "next/server";
import { handleAdminRead, handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation, mcpAdminQuery } from "@/app/api/mcp/admin/_lib/service";
import { ensureString, optionalNumber, optionalString } from "@/app/api/mcp/admin/_lib/validation";

export async function GET(req: NextRequest) {
  return handleAdminRead(req, async () => {
    const quizzes = await mcpAdminQuery<unknown[]>("listStandaloneQuizzes");
    return jsonSuccess({ quizzes });
  });
}

export async function POST(req: NextRequest) {
  return handleAdminWrite(req, async () => {
    const body = await readJsonBody(req);
    const result = await mcpAdminMutation<{ quizId: string }>("createStandaloneQuiz", {
      title: ensureString(body.title, "title"),
      description: optionalString(body.description, "description"),
      subject_id: optionalString(body.subject_id, "subject_id"),
      order_index: optionalNumber(body.order_index, "order_index"),
      source: "chatgpt-mcp",
    });
    return jsonSuccess({ quizId: result.quizId }, 201);
  });
}
