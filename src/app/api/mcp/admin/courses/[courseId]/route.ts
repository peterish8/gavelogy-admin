import { NextRequest } from "next/server";
import { handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { ApiError, jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation } from "@/app/api/mcp/admin/_lib/service";
import { optionalBoolean, optionalNumber, optionalString } from "@/app/api/mcp/admin/_lib/validation";

const COURSE_PATCH_FIELDS = ["name", "description", "price", "is_active", "is_free", "icon"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { courseId } = await params;
    const body = await readJsonBody(req);

    const patch: Record<string, unknown> = {};
    patch.name = optionalString(body.name, "name");
    patch.description = optionalString(body.description, "description");
    patch.price = optionalNumber(body.price, "price");
    patch.is_active = optionalBoolean(body.is_active, "is_active");
    patch.is_free = optionalBoolean(body.is_free, "is_free");
    patch.icon = optionalString(body.icon, "icon");

    const hasAnyPatch = COURSE_PATCH_FIELDS.some((field) => patch[field] !== undefined);
    if (!hasAnyPatch) {
      throw new ApiError(400, "BAD_REQUEST", "No allowlisted course fields provided");
    }

    await mcpAdminMutation("updateCourse", {
      courseId,
      patch,
      source: "chatgpt-mcp",
    });
    return jsonSuccess({ courseId, updated: true });
  });
}
