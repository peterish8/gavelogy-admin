import { ApiError } from './response'
import {
  GAVELOGY_ALLOWED_BOX_COLORS,
  GAVELOGY_ALLOWED_HIGHLIGHT_COLORS,
} from "@/lib/prompts";

export const ALLOWED_ITEM_TYPES = ['folder', 'file'] as const

export function ensureObject(value: unknown, name = 'body'): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(400, 'BAD_REQUEST', `${name} must be an object`)
  }
  return value as Record<string, unknown>
}

export function ensureString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new ApiError(400, 'BAD_REQUEST', `${field} must be a non-empty string`)
  }
  return value.trim()
}

export function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new ApiError(400, 'BAD_REQUEST', `${field} must be a string`)
  }
  return value
}

export function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') {
    throw new ApiError(400, 'BAD_REQUEST', `${field} must be a boolean`)
  }
  return value
}

export function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new ApiError(400, 'BAD_REQUEST', `${field} must be a number`)
  }
  return value
}

export function ensureArray(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ApiError(400, 'BAD_REQUEST', `${field} must be an array`)
  }
  return value
}

export function ensureItemType(value: unknown, field = 'item_type'): 'folder' | 'file' {
  const itemType = ensureString(value, field)
  if (!ALLOWED_ITEM_TYPES.includes(itemType as any)) {
    throw new ApiError(400, 'BAD_REQUEST', `${field} must be one of: ${ALLOWED_ITEM_TYPES.join(', ')}`)
  }
  return itemType as 'folder' | 'file'
}

export function pickAllowed<T extends Record<string, unknown>>(input: Record<string, unknown>, keys: readonly string[]): Partial<T> {
  const out: Record<string, unknown> = {}
  for (const key of keys) {
    if (input[key] !== undefined) out[key] = input[key]
  }
  return out as Partial<T>
}

export function toBooleanQueryParam(value: string | null): boolean {
  if (!value) return false
  return value.toLowerCase() === 'true' || value === '1'
}

const BOX_COLOR_SET = new Set<string>(GAVELOGY_ALLOWED_BOX_COLORS);
const HIGHLIGHT_COLOR_SET = new Set<string>(
  GAVELOGY_ALLOWED_HIGHLIGHT_COLORS.map((color) => color.toLowerCase()),
);

export function ensureSupportedNoteStyles(
  contentHtml: string,
  field = "content_html",
): string {
  const boxMatches = contentHtml.matchAll(/\[box:([a-zA-Z]+)\]/g);
  for (const match of boxMatches) {
    const color = match[1]?.toLowerCase() ?? "";
    if (!BOX_COLOR_SET.has(color)) {
      throw new ApiError(
        400,
        "BAD_REQUEST",
        `${field} uses unsupported box color "${match[1]}". Allowed: ${GAVELOGY_ALLOWED_BOX_COLORS.join(", ")}`,
      );
    }
  }

  const highlightMatches = contentHtml.matchAll(/\[hl:([^\]]+)\]/g);
  for (const match of highlightMatches) {
    const rawColor = match[1] ?? "";
    const color = rawColor.toLowerCase();
    if (!/^#[0-9a-f]{6}$/.test(color)) {
      throw new ApiError(
        400,
        "BAD_REQUEST",
        `${field} uses invalid highlight format "${rawColor}". Use 6-digit hex colors only.`,
      );
    }
    if (!HIGHLIGHT_COLOR_SET.has(color)) {
      throw new ApiError(
        400,
        "BAD_REQUEST",
        `${field} uses unsupported highlight color "${rawColor}". Allowed: ${GAVELOGY_ALLOWED_HIGHLIGHT_COLORS.join(", ")}`,
      );
    }
  }

  return contentHtml;
}
