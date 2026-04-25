import { NextRequest } from "next/server";
import { handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation } from "@/app/api/mcp/admin/_lib/service";
import {
  ensureItemType,
  ensureString,
  optionalBoolean,
  optionalNumber,
  optionalString,
} from "@/app/api/mcp/admin/_lib/validation";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { courseId } = await params;
    const body = await readJsonBody(req);
    const result = await mcpAdminMutation<{ itemId: string }>("createCourseItem", {
      courseId,
      parentId: optionalString(body.parentId, "parentId"),
      title: ensureString(body.title, "title"),
      description: optionalString(body.description, "description"),
      item_type: ensureItemType(body.item_type, "item_type"),
      order_index: optionalNumber(body.order_index, "order_index"),
      icon: optionalString(body.icon, "icon"),
      is_active: optionalBoolean(body.is_active, "is_active"),
      pdf_url: optionalString(body.pdf_url, "pdf_url"),
      source: "chatgpt-mcp",
    });
    return jsonSuccess({ itemId: result.itemId }, 201);
  });
}
