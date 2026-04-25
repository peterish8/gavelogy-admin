import { NextRequest } from "next/server";
import { handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation } from "@/app/api/mcp/admin/_lib/service";
import { ensureArray, ensureString, optionalBoolean, optionalNumber, optionalString } from "@/app/api/mcp/admin/_lib/validation";

export async function POST(req: NextRequest) {
  return handleAdminWrite(req, async () => {
    const body = await readJsonBody(req);
    const sourceCourseIds = ensureArray(body.sourceCourseIds, "sourceCourseIds").map((id, index) =>
      ensureString(id, `sourceCourseIds[${index}]`),
    );
    const result = await mcpAdminMutation<{ courseId: string }>("createCrashCourse", {
      name: ensureString(body.name, "name"),
      description: optionalString(body.description, "description") ?? "",
      sourceCourseIds,
      orderIndex: optionalNumber(body.orderIndex, "orderIndex"),
      activate: optionalBoolean(body.activate, "activate"),
      source: "chatgpt-mcp",
    });
    return jsonSuccess({ courseId: result.courseId }, 201);
  });
}
