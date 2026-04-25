import { NextRequest } from "next/server";
import { handleAdminRead } from "@/app/api/mcp/admin/_lib/handlers";
import { jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import {
  GAVELOGY_ALLOWED_BOX_COLORS,
  GAVELOGY_ALLOWED_HIGHLIGHT_COLORS,
  GAVELOGY_ALLOWED_NOTE_TAGS,
} from "@/lib/prompts";

export async function GET(req: NextRequest) {
  return handleAdminRead(req, async () =>
    jsonSuccess({
      allowedOperations: ["create", "read", "update", "publish"],
      forbiddenOperations: ["delete"],
      entities: {
        course: ["create", "read", "update"],
        structure_item: ["create", "read", "update"],
        note: ["create", "read", "update", "publish"],
        flashcards: ["create", "read", "update", "publish"],
        quiz: ["create", "read", "update", "publish"],
        daily_news: ["create", "read", "update"],
        pyq: ["create", "read", "update"],
        standalone_quiz: ["create", "read", "update"],
      },
      noteFormat: {
        format: "gavelogy-bracket-tags",
        promptVersion: "mega-notes-v1",
        allowedTags: GAVELOGY_ALLOWED_NOTE_TAGS,
        allowedHighlightColors: GAVELOGY_ALLOWED_HIGHLIGHT_COLORS,
        allowedBoxColors: GAVELOGY_ALLOWED_BOX_COLORS,
      },
    }),
  );
}
