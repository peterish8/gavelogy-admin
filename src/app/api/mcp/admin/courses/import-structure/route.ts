import { NextRequest } from "next/server";
import { handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { ApiError, jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation } from "@/app/api/mcp/admin/_lib/service";
import { ensureArray, ensureItemType, ensureObject, ensureString, optionalString } from "@/app/api/mcp/admin/_lib/validation";

type ImportItem = {
  tempId: string;
  parentTempId: string | null;
  item_type: "folder" | "file";
  title: string;
  order_index: number;
};

export async function POST(req: NextRequest) {
  return handleAdminWrite(req, async () => {
    const body = await readJsonBody(req);
    const rawItems = ensureArray(body.items, "items");
    const items: ImportItem[] = rawItems.map((rawItem, index) => {
      const item = ensureObject(rawItem, `items[${index}]`);
      const orderIndex = item.order_index;
      if (typeof orderIndex !== "number" || Number.isNaN(orderIndex)) {
        throw new ApiError(400, "BAD_REQUEST", `items[${index}].order_index must be a number`);
      }
      const parentTempIdValue = item.parentTempId;
      const parentTempId =
        parentTempIdValue === null || parentTempIdValue === undefined
          ? null
          : ensureString(parentTempIdValue, `items[${index}].parentTempId`);
      return {
        tempId: ensureString(item.tempId, `items[${index}].tempId`),
        parentTempId,
        item_type: ensureItemType(item.item_type, `items[${index}].item_type`),
        title: ensureString(item.title, `items[${index}].title`),
        order_index: orderIndex,
      };
    });

    const result = await mcpAdminMutation<{ courseId: string; createdItems: number }>(
      "importCourseStructure",
      {
        courseName: ensureString(body.courseName, "courseName"),
        courseDescription: optionalString(body.courseDescription, "courseDescription"),
        items,
        source: "chatgpt-mcp",
      },
    );

    return jsonSuccess(
      { courseId: result.courseId, createdItems: result.createdItems },
      201,
    );
  }, 2_000_000);
}
