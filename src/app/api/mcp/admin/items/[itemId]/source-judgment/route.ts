import { NextRequest } from "next/server";
import { handleAdminRead } from "@/app/api/mcp/admin/_lib/handlers";
import { ApiError, jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminQuery } from "@/app/api/mcp/admin/_lib/service";
import { getJudgmentTextFromBackblazePdf } from "@/lib/judgment-source";

type ItemNoteDataResponse = {
  structure_item?: {
    _id?: string;
    title?: string;
    item_type?: string;
    courseId?: string;
    pdf_url?: string | null;
  } | null;
  pdf_url?: string | null;
};

const DEFAULT_MAX_CHARS = 120_000;
const MIN_MAX_CHARS = 10_000;
const MAX_MAX_CHARS = 400_000;

function parseMaxChars(raw: string | null): number {
  if (!raw) return DEFAULT_MAX_CHARS;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new ApiError(400, "BAD_REQUEST", "maxChars must be an integer");
  }
  if (parsed < MIN_MAX_CHARS || parsed > MAX_MAX_CHARS) {
    throw new ApiError(
      400,
      "BAD_REQUEST",
      `maxChars must be between ${MIN_MAX_CHARS} and ${MAX_MAX_CHARS}`,
    );
  }
  return parsed;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleAdminRead(req, async () => {
    const { itemId } = await params;
    const maxChars = parseMaxChars(req.nextUrl.searchParams.get("maxChars"));
    const sourceData = await mcpAdminQuery<ItemNoteDataResponse>("getItemNoteData", {
      itemId,
      includeDraft: false,
    });

    const item = sourceData?.structure_item;
    if (!item) {
      throw new ApiError(404, "NOT_FOUND", `itemId not found: ${itemId}`);
    }
    if (item.item_type !== "file") {
      throw new ApiError(400, "BAD_REQUEST", "source-judgment is only available for file items");
    }

    const pdfUrl = sourceData.pdf_url ?? item.pdf_url ?? null;
    if (!pdfUrl) {
      throw new ApiError(404, "NOT_FOUND", "No pdf_url found for this item");
    }

    const extracted = await getJudgmentTextFromBackblazePdf(pdfUrl, maxChars);

    return jsonSuccess({
      itemId,
      title: item.title ?? "",
      courseId: item.courseId ?? null,
      sourceType: "backblaze",
      pdf_url: pdfUrl,
      objectKey: extracted.objectKey,
      sourceHashSha256: extracted.sourceHashSha256,
      textLength: extracted.textLength,
      returnedTextLength: extracted.extractedText.length,
      truncated: extracted.truncated,
      judgmentText: extracted.extractedText,
    });
  });
}

