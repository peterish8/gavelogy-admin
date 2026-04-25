import { NextRequest } from "next/server";
import { handleAdminRead } from "@/app/api/mcp/admin/_lib/handlers";
import { jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminQuery } from "@/app/api/mcp/admin/_lib/service";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ courseId: string }> },
) {
  return handleAdminRead(req, async () => {
    const { courseId } = await params;
    const bulkStatus = await mcpAdminQuery<unknown>("getBulkStatus", { courseId });
    return jsonSuccess(bulkStatus);
  });
}
