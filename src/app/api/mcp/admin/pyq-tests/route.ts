import { NextRequest } from "next/server";
import { handleAdminRead, handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation, mcpAdminQuery } from "@/app/api/mcp/admin/_lib/service";
import { ensureString, optionalBoolean, optionalNumber, optionalString } from "@/app/api/mcp/admin/_lib/validation";

export async function GET(req: NextRequest) {
  return handleAdminRead(req, async () => {
    const tests = await mcpAdminQuery<unknown[]>("listPyqTests");
    return jsonSuccess({ tests });
  });
}

export async function POST(req: NextRequest) {
  return handleAdminWrite(req, async () => {
    const body = await readJsonBody(req);
    const result = await mcpAdminMutation<{ testId: string }>("createPyqTest", {
      title: ensureString(body.title, "title"),
      exam_name: optionalString(body.exam_name, "exam_name"),
      year: optionalNumber(body.year, "year"),
      duration_minutes: optionalNumber(body.duration_minutes, "duration_minutes"),
      total_marks: optionalNumber(body.total_marks, "total_marks"),
      negative_marking: optionalNumber(body.negative_marking, "negative_marking"),
      instructions: optionalString(body.instructions, "instructions"),
      is_published: optionalBoolean(body.is_published, "is_published"),
      source: "chatgpt-mcp",
    });
    return jsonSuccess({ testId: result.testId }, 201);
  });
}
