/**
 * Shared PDF text-search helpers used by judgment-pdf-panel and NoteJudgmentEditor.
 * All functions operate on pdfjs-dist item arrays — safe to call client-side only.
 */

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

function fontSizeOf(item: any): number {
  return Math.abs((item.height as number) || (item.transform?.[0] as number) || 11)
}

/**
 * Search ONE page for needle. Returns a bounding box for the matched phrase.
 * Height covers one visual line (font-size × 2.3 to include generous PDF line spacing).
 */
export function searchOnPage(
  items: any[],
  pageNum: number,
  needle: string,
): { page: number; x: number; y: number; width: number; height: number } | null {
  const { flat, offsets } = buildPageFlat(items)
  const idx = flat.toLowerCase().indexOf(needle.toLowerCase())
  if (idx === -1) return null
  const endIdx = idx + needle.length

  let startI = -1
  for (let i = offsets.length - 1; i >= 0; i--) {
    if (offsets[i].start <= idx) { startI = i; break }
  }
  if (startI < 0 || !offsets[startI].item?.transform) return null

  let endI = startI
  for (let i = startI; i < offsets.length; i++) {
    if (offsets[i].start >= endIdx) break
    endI = i
  }

  const startItem = offsets[startI].item
  const x0        = startItem.transform[4] as number
  const y0        = startItem.transform[5] as number
  const fontSize  = fontSizeOf(startItem)

  // Right-edge: next item's x if on same line, else char-count estimate
  let rightEdge: number
  const nextI = endI + 1
  if (nextI < offsets.length && offsets[nextI].item?.transform) {
    const nx = offsets[nextI].item.transform[4] as number
    const ny = offsets[nextI].item.transform[5] as number
    rightEdge = Math.abs(ny - y0) < fontSize * 1.5
      ? nx
      : offsets[endI].item.transform[4] + ((offsets[endI].item.str ?? '') as string).length * fontSize * 0.55
  } else {
    rightEdge = x0 + needle.length * fontSize * 0.55
  }

  const width  = Math.max(rightEdge - x0, fontSize * 4)
  const below  = fontSize * 0.3
  const above  = fontSize * 2.0

  return {
    page:   pageNum,
    x:      Math.max(x0 - 2, 0),
    y:      Math.max(y0 - below, 0),
    width:  width + 4,
    height: above + below,
  }
}

/**
 * Search ONE page for a START + END needle pair.
 * Returns a bounding box spanning from the top of the start phrase to the bottom of the end phrase —
 * covers multi-line paragraphs exactly.
 */
export function searchOnPageRange(
  items: any[],
  pageNum: number,
  startNeedle: string,
  endNeedle: string,
): { page: number; x: number; y: number; width: number; height: number } | null {
  const { flat, offsets } = buildPageFlat(items)
  const flatL = flat.toLowerCase()

  const startIdx = flatL.indexOf(startNeedle.toLowerCase())
  if (startIdx === -1) return null

  // End needle must come AFTER start
  const endIdx = flatL.indexOf(endNeedle.toLowerCase(), startIdx + startNeedle.length)
  if (endIdx === -1) return null
  const endPhraseEnd = endIdx + endNeedle.length

  // Start item
  let startI = -1
  for (let i = offsets.length - 1; i >= 0; i--) {
    if (offsets[i].start <= startIdx) { startI = i; break }
  }
  if (startI < 0 || !offsets[startI].item?.transform) return null

  // End item
  let endI = startI
  for (let i = startI; i < offsets.length; i++) {
    if (offsets[i].start >= endPhraseEnd) break
    endI = i
  }

  const startItem = offsets[startI].item
  const endItem   = offsets[endI].item
  const fontSize  = fontSizeOf(startItem)

  // y0 = baseline of START text (higher on page = larger y value in PDF coords)
  // y1 = baseline of END text (lower on page = smaller y value)
  const y0 = startItem.transform[5] as number
  const y1 = endItem.transform[5]   as number

  const topY    = Math.max(y0, y1)   // highest baseline (start of paragraph)
  const bottomY = Math.min(y0, y1)   // lowest baseline (end of paragraph)

  const below  = fontSize * 0.3
  const above  = fontSize * 0.85     // cap-height above baseline

  return {
    page:   pageNum,
    x:      0,
    y:      Math.max(bottomY - below, 0),              // bottom of box in PDF y-up
    width:  9999,                                       // full-width (renderer uses left:0/right:0)
    height: (topY + above) - (bottomY - below),        // spans entire paragraph
  }
}

/**
 * Search PDF pages for `searchText` (+ optional `endText` for multi-line range).
 * If `preferPage` is given, tries that page FIRST.
 * Falls back to progressively shorter needles (6 → 4 → 3 words).
 */
export function findTextInPageData(
  pageData: { pageNum: number; items: any[] }[],
  searchText: string,
  preferPage?: number,
  endText?: string,
): { page: number; x: number; y: number; width: number; height: number } | null {
  if (!searchText?.trim()) return null

  const ordered = preferPage
    ? [...pageData].sort((a, b) => (a.pageNum === preferPage ? -1 : b.pageNum === preferPage ? 1 : 0))
    : pageData

  const startWords = searchText.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)

  // If we have an end text, try range search first
  if (endText?.trim()) {
    const endWords = endText.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
    for (let startTake = Math.min(startWords.length, 6); startTake >= 3; startTake--) {
      const startNeedle = startWords.slice(0, startTake).join(' ')
      for (let endTake = Math.min(endWords.length, 6); endTake >= 3; endTake--) {
        const endNeedle = endWords.slice(-endTake).join(' ')
        for (const { pageNum, items } of ordered) {
          const hit = searchOnPageRange(items, pageNum, startNeedle, endNeedle)
          if (hit) return hit
        }
      }
    }
    // Range search failed — fall through to single-line search
  }

  // Single-phrase search (original behaviour)
  for (let take = Math.min(startWords.length, 6); take >= 3; take--) {
    const needle = startWords.slice(0, take).join(' ')
    for (const { pageNum, items } of ordered) {
      const hit = searchOnPage(items, pageNum, needle)
      if (hit) return hit
    }
  }
  return null
}
