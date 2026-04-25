import { NextRequest } from "next/server";
import { handleAdminRead, handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation, mcpAdminQuery } from "@/app/api/mcp/admin/_lib/service";
import {
  ensureString,
  ensureSupportedNoteStyles,
  optionalBoolean,
  optionalString,
  toBooleanQueryParam,
} from "@/app/api/mcp/admin/_lib/validation";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleAdminRead(req, async () => {
    const { itemId } = await params;
    const includeDraft = toBooleanQueryParam(req.nextUrl.searchParams.get("includeDraft"));
    const noteData = await mcpAdminQuery<unknown>("getItemNoteData", {
      itemId,
      includeDraft,
    });
    return jsonSuccess(noteData);
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { itemId } = await params;
    const body = await readJsonBody(req);
    const contentHtml = ensureSupportedNoteStyles(
      ensureString(body.content_html, "content_html"),
      "content_html",
    );
    const result = await mcpAdminMutation<{ noteId: string }>("upsertItemNoteContent", {
      itemId,
      content_html: contentHtml,
      clear_draft: optionalBoolean(body.clear_draft, "clear_draft"),
      source: optionalString(body.source, "source") ?? "chatgpt-mcp",
      action: "publish",
    });
    return jsonSuccess({ itemId, noteId: result.noteId, status: "published" }, 201);
  }, 2_000_000);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { itemId } = await params;
    const body = await readJsonBody(req);
    const contentHtml = ensureSupportedNoteStyles(
      ensureString(body.content_html, "content_html"),
      "content_html",
    );
    const result = await mcpAdminMutation<{ noteId: string }>("upsertItemNoteContent", {
      itemId,
      content_html: contentHtml,
      clear_draft: optionalBoolean(body.clear_draft, "clear_draft"),
      source: optionalString(body.source, "source") ?? "chatgpt-mcp",
      action: "update",
    });
    return jsonSuccess({ itemId, noteId: result.noteId, status: "updated" });
  }, 2_000_000);
}
