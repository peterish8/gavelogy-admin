/**
 * Shared PDF text-search helpers used by judgment-pdf-panel and NoteJudgmentEditor.
 * All functions operate on pdfjs-dist item arrays — safe to call client-side only.
 */

// Converts a hex color string to an rgba() CSS string with the given alpha; used for PDF highlight overlays.
export function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Build a flat text string + offset map for one page's items. */
export function buildPageFlat(items: any[]): { flat: string; offsets: { start: number; item: any }[] } {
  let flat = ''
  const offsets: { start: number; item: any }[] = []
  for (const item of items) {
    const s = (item.str ?? '') + ' '
    offsets.push({ start: flat.length, item })
    flat += s
  }
  return { flat, offsets }
}

/** Search ONE page for needle. Returns coordinates or null. */
export function searchOnPage(
  items: any[],
  pageNum: number,
  needle: string,
): { page: number; x: number; y: number; width: number; height: number } | null {
  const { flat, offsets } = buildPageFlat(items)
  const idx = flat.toLowerCase().indexOf(needle.toLowerCase())
  if (idx === -1) return null
  let found: any = null
  for (let i = offsets.length - 1; i >= 0; i--) {
    if (offsets[i].start <= idx) { found = offsets[i].item; break }
  }
  if (!found?.transform) return null
  const x = found.transform[4] as number
  const y = found.transform[5] as number
  const w = Math.max((found.width as number) ?? 80, 40)
  const h = Math.max((found.height as number) ?? 12, 8)
  return { page: pageNum, x: Math.max(x, 0), y: Math.max(y - h, 0), width: w, height: h + 2 }
}

/**
 * Search PDF pages for `searchText`.
 * If `preferPage` is given, tries that page FIRST (AI told us which page it came from).
 * Falls back to all pages with progressively shorter needles (6 → 4 → 3 words).
 */
export function findTextInPageData(
  pageData: { pageNum: number; items: any[] }[],
  searchText: string,
  preferPage?: number,
): { page: number; x: number; y: number; width: number; height: number } | null {
  if (!searchText?.trim()) return null
  const words = searchText.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  const ordered = preferPage
    ? [...pageData].sort((a, b) => (a.pageNum === preferPage ? -1 : b.pageNum === preferPage ? 1 : 0))
    : pageData
  for (let take = Math.min(words.length, 6); take >= 3; take--) {
    const needle = words.slice(0, take).join(' ')
    for (const { pageNum, items } of ordered) {
      const hit = searchOnPage(items, pageNum, needle)
      if (hit) return hit
    }
  }
  return null
}
