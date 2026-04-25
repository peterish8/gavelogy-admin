import { createHash } from "crypto";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { b2Client, BUCKET } from "@/lib/b2-client";
import { extractPdfText } from "@/lib/pdf-text-extract";

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function decodePathParts(pathname: string): string[] {
  return pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
}

/**
 * Accepts either a stored B2 object key (recommended) or a Backblaze URL and returns object key.
 * Rejects non-Backblaze URLs to enforce trusted-source-only behavior.
 */
export function resolveBackblazeObjectKey(pdfUrl: string): string {
  const value = pdfUrl.trim();
  if (!value) throw new Error("Missing pdf_url");

  if (!isHttpUrl(value)) {
    return value;
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Invalid pdf_url format");
  }

  if (!parsed.hostname.toLowerCase().includes("backblazeb2.com")) {
    throw new Error("Only Backblaze-hosted PDFs are allowed for trusted judgment source");
  }

  const parts = decodePathParts(parsed.pathname);
  if (parts.length === 0) {
    throw new Error("Unable to resolve Backblaze object key from pdf_url");
  }

  // https://f005.backblazeb2.com/file/<bucket>/<key>
  if (parts[0] === "file" && parts.length >= 3) {
    return parts.slice(2).join("/");
  }

  // path-style fallback: /<bucket>/<key>
  if (parts[0] === BUCKET && parts.length >= 2) {
    return parts.slice(1).join("/");
  }

  // virtual-host style fallback: bucket.s3....../<key>
  return parts.join("/");
}

async function streamBodyToBuffer(body: unknown): Promise<Buffer> {
  if (!body) throw new Error("Backblaze returned empty response body");

  const streamBody = body as {
    transformToByteArray?: () => Promise<Uint8Array>;
    arrayBuffer?: () => Promise<ArrayBuffer>;
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
  };

  if (typeof streamBody.transformToByteArray === "function") {
    const bytes = await streamBody.transformToByteArray();
    return Buffer.from(bytes);
  }

  if (typeof streamBody.arrayBuffer === "function") {
    const arrayBuffer = await streamBody.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  if (typeof streamBody[Symbol.asyncIterator] === "function") {
    const chunks: Buffer[] = [];
    for await (const chunk of streamBody as AsyncIterable<unknown>) {
      if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      } else if (typeof chunk === "string") {
        chunks.push(Buffer.from(chunk));
      } else if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      }
    }
    if (chunks.length === 0) {
      throw new Error("Backblaze stream had no PDF bytes");
    }
    return Buffer.concat(chunks);
  }

  throw new Error("Unsupported Backblaze body stream type");
}

export async function fetchBackblazePdfBuffer(objectKey: string): Promise<Buffer> {
  const result = await b2Client.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
    }),
  );
  return streamBodyToBuffer(result.Body);
}

export type JudgmentSourceResult = {
  objectKey: string;
  sourceHashSha256: string;
  extractedText: string;
  textLength: number;
  truncated: boolean;
};

export async function getJudgmentTextFromBackblazePdf(
  pdfUrl: string,
  maxChars: number,
): Promise<JudgmentSourceResult> {
  const objectKey = resolveBackblazeObjectKey(pdfUrl);
  const pdfBuffer = await fetchBackblazePdfBuffer(objectKey);
  const fullText = await extractPdfText(pdfBuffer);
  const normalized = fullText.trim();
  const extractedText = normalized.slice(0, maxChars);
  const sourceHashSha256 = createHash("sha256").update(pdfBuffer).digest("hex");

  return {
    objectKey,
    sourceHashSha256,
    extractedText,
    textLength: normalized.length,
    truncated: normalized.length > extractedText.length,
  };
}

