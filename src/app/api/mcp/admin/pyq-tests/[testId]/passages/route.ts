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
    const passages = await mcpAdminQuery<unknown[]>("listPyqPassages", { testId });
    return jsonSuccess({ passages });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ testId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { testId } = await params;
    const body = await readJsonBody(req);
    const result = await mcpAdminMutation<{ passageId: string }>("createPyqPassage", {
      testId,
      passage_text: ensureString(body.passage_text, "passage_text"),
      citation: optionalString(body.citation, "citation"),
      section_number: optionalString(body.section_number, "section_number"),
      subject: optionalString(body.subject, "subject"),
      order_index: optionalNumber(body.order_index, "order_index"),
      source: "chatgpt-mcp",
    });
    return jsonSuccess({ passageId: result.passageId }, 201);
  });
}
