/**
 * Shared PDF text extraction utility.
 * Keeps PDF parsing behavior consistent across API routes and Telegram flows.
 */
export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  // pdf-parse/pdfjs expects these browser globals in some runtimes.
  if (typeof globalThis.DOMMatrix === "undefined") {
    // @ts-expect-error runtime polyfill
    globalThis.DOMMatrix = class DOMMatrix {
      constructor() {
        // no-op
      }
    };
  }
  if (typeof globalThis.ImageData === "undefined") {
    // @ts-expect-error runtime polyfill
    globalThis.ImageData = class ImageData {
      constructor(public width: number, public height: number) {}
    };
  }
  if (typeof globalThis.Path2D === "undefined") {
    // @ts-expect-error runtime polyfill
    globalThis.Path2D = class Path2D {};
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require("pdf-parse") as (
    buf: Buffer,
    options?: object,
  ) => Promise<{ text: string }>;

  const parsed = await pdfParse(pdfBuffer, {
    // Avoid fixture-file probe done by pdf-parse on first load.
    max: 0,
  });

  if (!parsed.text?.trim()) {
    throw new Error("No text extracted from PDF - the file may be scanned/image-based.");
  }

  return parsed.text;
}

