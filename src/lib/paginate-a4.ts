/**
 * paginate-a4.ts
 * 
 * A4 Pagination Engine
 * 
 * DEBUG: Open browser console (F12) and check for "[A4]" messages.
 * You can also manually run: window.__paginateA4() in the console.
 */

const PAGE_HEIGHT = 1123
const REPEAT_HEIGHT = 1147  // PAGE_HEIGHT + 24px gap between pages
const FOOTER_ZONE = 60
const HEADER_ZONE = 60
const USABLE_HEIGHT = PAGE_HEIGHT - FOOTER_ZONE - HEADER_ZONE

// Guard flag to prevent concurrent pagination runs triggered by rapid editor updates.
let _paginating = false

// Pushes editor child elements down with margin-top so they never overlap A4 page footer/header zones.
// Call after every editor content change that may affect layout.
export function paginateA4(proseMirrorEl: HTMLElement | null) {
  if (!proseMirrorEl || _paginating) {
    console.log('[A4] Skipped: el=', !!proseMirrorEl, 'busy=', _paginating)
    return
  }
  _paginating = true

  try {
    const children = Array.from(proseMirrorEl.children) as HTMLElement[]
    console.log(`[A4] Start: ${children.length} children, editor height=${proseMirrorEl.offsetHeight}px, position=${getComputedStyle(proseMirrorEl).position}`)

    // RESET
    let resetCount = 0
    for (const child of children) {
      if (child.dataset.a4Push) {
        child.style.marginTop = ''
        delete child.dataset.a4Push
        resetCount++
      }
    }
    if (resetCount > 0) console.log(`[A4] Reset ${resetCount} previous pushes`)

    void proseMirrorEl.offsetHeight // reflow

    // PAGINATE
    let pushCount = 0

    for (let i = 0; i < children.length; i++) {
      const child = children[i]
      const top = child.offsetTop
      const height = child.offsetHeight
      const bottom = top + height
      const tag = `<${child.tagName}${child.className ? '.' + child.className.split(' ')[0] : ''}>`

      // Which page? Use REPEAT_HEIGHT (1147) to account for 24px gap between pages
      const pageOfTop = Math.floor(top / REPEAT_HEIGHT)
      const footerStart = pageOfTop * REPEAT_HEIGHT + PAGE_HEIGHT - FOOTER_ZONE

      // Log every element near a page boundary
      if (bottom > footerStart - 200 || top < HEADER_ZONE) {
        console.log(`[A4] [${i}] ${tag} top=${top} h=${height} bottom=${bottom} page=${pageOfTop} footerAt=${footerStart} crossesFooter=${bottom > footerStart}`)
      }

      // Skip elements taller than usable area
      if (height > USABLE_HEIGHT) {
        if (bottom > footerStart) {
          console.log(`[A4] [${i}] ${tag} SKIPPED (too tall: ${height}px > ${USABLE_HEIGHT}px usable)`)
        }
        continue
      }

      // Check if element crosses footer zone
      if (bottom > footerStart) {
        const targetTop = (pageOfTop + 1) * REPEAT_HEIGHT + HEADER_ZONE
        const push = targetTop - top

        if (push > 0 && push < PAGE_HEIGHT) {
          console.log(`[A4] [${i}] ${tag} PUSHING by ${push}px (top=${top} → target=${targetTop})`)

          // Set margin-top
          child.style.marginTop = `${push}px`
          child.dataset.a4Push = '1'
          void proseMirrorEl.offsetHeight // reflow

          // Self-correct for margin collapsing
          const actualTop = child.offsetTop
          if (Math.abs(actualTop - targetTop) > 3) {
            const correction = targetTop - actualTop
            const newMargin = push + correction
            console.log(`[A4] [${i}] Self-correct: actual=${actualTop}, target=${targetTop}, correction=${correction}, newMargin=${newMargin}`)
            child.style.marginTop = `${Math.max(0, newMargin)}px`
            void proseMirrorEl.offsetHeight
          }

          pushCount++
        }
      }
    }

    console.log(`[A4] Done. ${pushCount} pushes applied. New editor height=${proseMirrorEl.offsetHeight}px`)

    // Expose for manual debugging
    if (typeof window !== 'undefined') {
      (window as any).__paginateA4 = () => paginateA4(proseMirrorEl)
      ;(window as any).__a4Info = () => {
        const ch = Array.from(proseMirrorEl.children) as HTMLElement[]
        ch.forEach((c, i) => {
          const t = c.offsetTop, h = c.offsetHeight
          const page = Math.floor(t / PAGE_HEIGHT)
          const footer = (page + 1) * PAGE_HEIGHT - FOOTER_ZONE
          console.log(`[${i}] <${c.tagName}${c.className ? '.' + c.className.split(' ')[0] : ''}> top=${t} h=${h} bottom=${t+h} page=${page} footerAt=${footer} IN_FOOTER=${(t+h) > footer} push=${c.dataset.a4Push || 'no'} marginTop="${c.style.marginTop}"`)
        })
      }
    }
  } finally {
    _paginating = false
  }
}
