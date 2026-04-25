import { NextRequest } from "next/server";
import { handleAdminRead, handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation, mcpAdminQuery } from "@/app/api/mcp/admin/_lib/service";
import { ensureString, optionalBoolean, optionalNumber, optionalString } from "@/app/api/mcp/admin/_lib/validation";

export async function GET(req: NextRequest) {
  return handleAdminRead(req, async () => {
    const courses = await mcpAdminQuery<unknown[]>("listCourses");
    return jsonSuccess({ courses });
  });
}

export async function POST(req: NextRequest) {
  return handleAdminWrite(req, async () => {
    const body = await readJsonBody(req);
    const payload = {
      name: ensureString(body.name, "name"),
      description: optionalString(body.description, "description"),
      price: optionalNumber(body.price, "price"),
      is_active: optionalBoolean(body.is_active, "is_active"),
      is_free: optionalBoolean(body.is_free, "is_free"),
      icon: optionalString(body.icon, "icon"),
      source: "chatgpt-mcp",
    };
    const result = await mcpAdminMutation<{ courseId: string }>("createCourse", payload);
    return jsonSuccess({ courseId: result.courseId }, 201);
  });
}
