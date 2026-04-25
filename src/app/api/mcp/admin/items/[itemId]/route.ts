import { NextRequest } from "next/server";
import { handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { ApiError, jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation } from "@/app/api/mcp/admin/_lib/service";
import {
  ensureItemType,
  optionalBoolean,
  optionalNumber,
  optionalString,
} from "@/app/api/mcp/admin/_lib/validation";

const ITEM_PATCH_FIELDS = [
  "title",
  "description",
  "parentId",
  "order_index",
  "icon",
  "is_active",
  "pdf_url",
  "item_type",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { itemId } = await params;
    const body = await readJsonBody(req);
    const patch: Record<string, unknown> = {
      title: optionalString(body.title, "title"),
      description: optionalString(body.description, "description"),
      parentId: body.parentId === null ? null : optionalString(body.parentId, "parentId"),
      order_index: optionalNumber(body.order_index, "order_index"),
      icon: optionalString(body.icon, "icon"),
      is_active: optionalBoolean(body.is_active, "is_active"),
      pdf_url: optionalString(body.pdf_url, "pdf_url"),
    };

    if (body.item_type !== undefined) {
      patch.item_type = ensureItemType(body.item_type, "item_type");
    }

    const hasAnyPatch = ITEM_PATCH_FIELDS.some((field) => patch[field] !== undefined);
    if (!hasAnyPatch) {
      throw new ApiError(400, "BAD_REQUEST", "No allowlisted structure item fields provided");
    }

    await mcpAdminMutation("updateCourseItem", {
      itemId,
      patch,
      source: "chatgpt-mcp",
    });
    return jsonSuccess({ itemId, updated: true });
  });
}
