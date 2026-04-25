import { NextRequest } from "next/server";
import { handleAdminRead, handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation, mcpAdminQuery } from "@/app/api/mcp/admin/_lib/service";
import { ensureArray, ensureObject, optionalString } from "@/app/api/mcp/admin/_lib/validation";

function parseFlashcards(input: unknown) {
  const raw = ensureArray(input, "flashcards");
  return raw.map((entry, index) => {
    const flashcard = ensureObject(entry, `flashcards[${index}]`);
    return {
      front: flashcard.front,
      back: flashcard.back,
    };
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleAdminRead(req, async () => {
    const { itemId } = await params;
    const data = await mcpAdminQuery<unknown>("getItemFlashcards", { itemId });
    return jsonSuccess(data);
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { itemId } = await params;
    const body = await readJsonBody(req);
    const result = await mcpAdminMutation<{ flashcardsCount: number }>("upsertItemFlashcards", {
      itemId,
      flashcards: parseFlashcards(body.flashcards),
      source: optionalString(body.source, "source") ?? "chatgpt-mcp",
      action: "publish",
    });
    return jsonSuccess({ itemId, flashcardsCount: result.flashcardsCount, status: "published" }, 201);
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { itemId } = await params;
    const body = await readJsonBody(req);
    const result = await mcpAdminMutation<{ flashcardsCount: number }>("upsertItemFlashcards", {
      itemId,
      flashcards: parseFlashcards(body.flashcards),
      source: optionalString(body.source, "source") ?? "chatgpt-mcp",
      action: "update",
    });
    return jsonSuccess({ itemId, flashcardsCount: result.flashcardsCount, status: "updated" });
  });
}
