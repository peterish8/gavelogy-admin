import { NextRequest } from "next/server";
import { handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { ApiError, jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation } from "@/app/api/mcp/admin/_lib/service";
import { optionalNumber, optionalString } from "@/app/api/mcp/admin/_lib/validation";

const PATCH_FIELDS = ["passage_text", "citation", "section_number", "subject", "order_index"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ passageId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { passageId } = await params;
    const body = await readJsonBody(req);
    const patch: Record<string, unknown> = {
      passage_text: optionalString(body.passage_text, "passage_text"),
      citation: optionalString(body.citation, "citation"),
      section_number: optionalString(body.section_number, "section_number"),
      subject: optionalString(body.subject, "subject"),
      order_index: optionalNumber(body.order_index, "order_index"),
    };
    const hasAnyPatch = PATCH_FIELDS.some((field) => patch[field] !== undefined);
    if (!hasAnyPatch) {
      throw new ApiError(400, "BAD_REQUEST", "No allowlisted PYQ passage fields provided");
    }
    await mcpAdminMutation("updatePyqPassage", {
      passageId,
      patch,
      source: "chatgpt-mcp",
    });
    return jsonSuccess({ passageId, updated: true });
  });
}
