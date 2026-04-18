/**
 * pdf-utils.ts
 * 
 * Shared constants and utility functions for PDF-Note connections.
 */

export const LINK_COLORS = [
  { name: 'Amber',  hex: '#c9922a' },  // Facts
  { name: 'Rose',   hex: '#dc2626' },  // Issues
  { name: 'Blue',   hex: '#2563eb' },  // Ratio / Holding
  { name: 'Violet', hex: '#7c3aed' },  // Reasoning / Doctrine
  { name: 'Orange', hex: '#ea580c' },  // Statute / Provision
  { name: 'Green',  hex: '#16a34a' },  // Evolution / Significance
] as const

export const DEFAULT_LINK_COLOR = '#c9922a'

/**
 * Decodes a link label that may be plain text or a JSON string.
 */
export function parseLinkMeta(label: string | null): { text: string; color: string } {
  if (!label) return { text: '', color: DEFAULT_LINK_COLOR }
  try {
    if (label.startsWith('{')) {
      const parsed = JSON.parse(label)
      return { text: parsed.text ?? '', color: parsed.color ?? DEFAULT_LINK_COLOR }
    }
  } catch {}
  return { text: label, color: DEFAULT_LINK_COLOR }
}

/**
 * Encodes display text and hex color into the JSON format stored in the database.
 */
export function encodeLinkMeta(text: string, color: string): string {
  return JSON.stringify({ text, color })
}

/**
 * Converts a hex color string to an "r,g,b" comma-separated string for use in rgba() CSS values.
 */
export function hexToRgb(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r},${g},${b}`
}
