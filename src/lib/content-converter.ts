/**
 * content-converter.ts
 * 
 * Handles conversion between Tiptap HTML and Custom Tag-based Format.
 * 
 * Supported Tags:
 * - [box:color]Content[/box]       <-> <div class="note-box note-{color}">Content</div>
 * - [b]Content[/b]                 <-> <strong>Content</strong>
 * - [i]Content[/i]                 <-> <em>Content</em>
 * - [u]Content[/u]                 <-> <u>Content</u>
 * - [hl:color]Content[/hl]         <-> <mark style="background-color:color">Content</mark>
 * - [size:Xpx]Content[/size]       <-> <span style="font-size:Xpx">Content</span>
 * - [h1]Content[/h1]               <-> <h1>Content</h1>
 * - [h2]Content[/h2]               <-> <h2>Content</h2>
 * - [h3]Content[/h3]               <-> <h3>Content</h3>
 * - [p]Content[/p]                 <-> <p>Content</p>
 * - [hr]                           <-> <hr>
 * - [li]Content[/li]               <-> <li>Content</li>
 * - [ul]Content[/ul]               <-> <ul>Content</ul>
 * - [ol]Content[/ol]               <-> <ol>Content</ol>
 */

// Converts Tiptap HTML to the app's custom bracket-tag format (e.g. [b], [hl:#fff], [box:blue]);
// must run client-side only as it uses DOMParser. Processes nodes deepest-first to preserve nesting.
export function htmlToCustom(html: string): string {
    if (!html) return ''
    if (typeof window === 'undefined') return html // Server-side fallback (should satisfy build)

    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Order matters! Process deepest/inline nodes first, then blocks, then containers.
    // This ensures that when we replace a container's outerHTML, the children inside
    // are already converted to strings and preserved.

    // ========== INLINE ELEMENTS ==========

    // 0. Link spans (judgment connections) — process FIRST before other spans
    const linkSpans = Array.from(doc.querySelectorAll('span.linked-text[data-link-id]'))
    linkSpans.forEach(el => {
        const id = (el as HTMLElement).dataset.linkId
        el.outerHTML = `[link:${id}]${el.innerHTML}[/link]`
    })

    // 1. Bold
    const bolds = Array.from(doc.querySelectorAll('strong, b'))
    bolds.forEach(el => el.outerHTML = `[b]${el.innerHTML}[/b]`)

    // 2. Italic
    const italics = Array.from(doc.querySelectorAll('em, i'))
    italics.forEach(el => el.outerHTML = `[i]${el.innerHTML}[/i]`)

    // 3. Underline
    const underlines = Array.from(doc.querySelectorAll('u'))
    underlines.forEach(el => el.outerHTML = `[u]${el.innerHTML}[/u]`)

    // 4. Highlight (mark tags with background-color)
    const marks = Array.from(doc.querySelectorAll('mark'))
    marks.forEach(el => {
        const bgColor = (el as HTMLElement).style.backgroundColor || ''
        // Extract hex or rgb color
        let colorCode = bgColor
        // If it's an rgb value, convert to hex (simplified)
        if (bgColor.startsWith('rgb')) {
            // Parse rgb(r, g, b)
            const match = bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
            if (match) {
                const r = parseInt(match[1]).toString(16).padStart(2, '0')
                const g = parseInt(match[2]).toString(16).padStart(2, '0')
                const b = parseInt(match[3]).toString(16).padStart(2, '0')
                colorCode = `#${r}${g}${b}`
            }
        }
        el.outerHTML = `[hl:${colorCode}]${el.innerHTML}[/hl]`
    })

    // 5. Font Size (span with font-size style)
    const spans = Array.from(doc.querySelectorAll('span[style*="font-size"]'))
    spans.forEach(el => {
        const fontSize = (el as HTMLElement).style.fontSize || ''
        if (fontSize) {
            el.outerHTML = `[size:${fontSize}]${el.innerHTML}[/size]`
        }
    })

    // ========== BLOCK ELEMENTS ==========

    // 6. Horizontal Rule
    const hrs = Array.from(doc.querySelectorAll('hr'))
    hrs.forEach(el => el.outerHTML = `[hr]`)

    // 7. Headings
    const h1s = Array.from(doc.querySelectorAll('h1'))
    h1s.forEach(el => el.outerHTML = `[h1]${el.innerHTML}[/h1]`)
    
    const h2s = Array.from(doc.querySelectorAll('h2'))
    h2s.forEach(el => el.outerHTML = `[h2]${el.innerHTML}[/h2]`)

    const h3s = Array.from(doc.querySelectorAll('h3'))
    h3s.forEach(el => el.outerHTML = `[h3]${el.innerHTML}[/h3]`)

    // 8. Lists (Unified & Reversed for Nesting)
    // We must process deeply nested lists first (e.g., UL inside LI inside UL).
    // querying all at once and reversing ensures we hit leaves before roots.
    const listElements = Array.from(doc.querySelectorAll('ul, ol, li')).reverse()
    listElements.forEach(el => {
        const tag = el.tagName.toLowerCase()
        if (tag === 'ul') el.outerHTML = `[ul]${el.innerHTML}[/ul]`
        else if (tag === 'ol') el.outerHTML = `[ol]${el.innerHTML}[/ol]`
        else if (tag === 'li') el.outerHTML = `[li]${el.innerHTML}[/li]`
    })

    // 9. Paragraphs
    const paragraphs = Array.from(doc.querySelectorAll('p'))
    paragraphs.forEach(el => el.outerHTML = `[p]${el.innerHTML}[/p]`)

    // ========== CONTAINERS ==========

    // 10. Tables (process before note boxes so nested content is already converted)
    const ths = Array.from(doc.querySelectorAll('th'))
    ths.forEach(el => el.outerHTML = `[th]${el.innerHTML}[/th]`)
    const tds = Array.from(doc.querySelectorAll('td'))
    tds.forEach(el => el.outerHTML = `[td]${el.innerHTML}[/td]`)
    const trs = Array.from(doc.querySelectorAll('tr'))
    trs.forEach(el => el.outerHTML = `[tr]${el.innerHTML}[/tr]`)
    const tables = Array.from(doc.querySelectorAll('table'))
    tables.forEach(el => el.outerHTML = `[table]${el.innerHTML}[/table]`)
    // Strip tbody/thead wrappers (TipTap wraps rows in these)
    // Already handled by removing the tbody tag via the table replacement above

    // 11. Note Boxes (process last so children are already converted)
    const noteBoxes = Array.from(doc.querySelectorAll('div.note-box'))
    noteBoxes.forEach(el => {
        let color = 'blue'
        el.classList.forEach(cls => {
            if (cls.startsWith('note-') && cls !== 'note-box') {
                color = cls.replace('note-', '')
            }
        })
        el.outerHTML = `[box:${color}]${el.innerHTML}[/box]`
    })

    // Get the final string
    let content = doc.body.innerHTML

    // Clean up <br> to newlines
    content = content.replace(/<br\s*\/?>/g, '\n')
    
    return content
}

// Converts the app's custom bracket-tag format back to standard HTML for loading into the Tiptap editor.
// Pure string replace — safe to call on server side (no DOM).
export function customToHtml(text: string): string {
    if (!text) return ''
    
    let html = text

    // ========== CONTAINERS ==========

    // 0. Link spans (judgment connections)
    html = html.replace(/\[link:([^\]]+)\]/g, '<span class="linked-text" data-link-id="$1" style="color:#c9922a;border-bottom:2px dashed #c9922a;cursor:pointer;padding-bottom:1px">')
    html = html.replace(/\[\/link\]/g, '</span>')

    // 1. Note Boxes
    html = html.replace(/\[box:([a-z]+)\]/g, '<div class="note-box note-$1">')
    html = html.replace(/\[\/box\]/g, '</div>')

    // ========== INLINE ELEMENTS ==========

    // 2. Bold
    html = html.replace(/\[b\]/g, '<strong>')
    html = html.replace(/\[\/b\]/g, '</strong>')

    // 3. Italic
    html = html.replace(/\[i\]/g, '<em>')
    html = html.replace(/\[\/i\]/g, '</em>')

    // 4. Underline
    html = html.replace(/\[u\]/g, '<u>')
    html = html.replace(/\[\/u\]/g, '</u>')

    // 5. Highlight (supports hex colors)
    html = html.replace(/\[hl:(#?[a-fA-F0-9]+)\]/g, '<mark style="background-color:$1">')
    html = html.replace(/\[\/hl\]/g, '</mark>')

    // 6. Font Size (supports px, pt, em, rem)
    html = html.replace(/\[size:(\d+(?:px|pt|em|rem)?)\]/g, '<span style="font-size:$1 !important">')
    html = html.replace(/\[\/size\]/g, '</span>')

    // ========== BLOCK ELEMENTS ==========

    // 7. Headings
    html = html.replace(/\[h1\]/g, '<h1>')
    html = html.replace(/\[\/h1\]/g, '</h1>')
    html = html.replace(/\[h2\]/g, '<h2>')
    html = html.replace(/\[\/h2\]/g, '</h2>')
    html = html.replace(/\[h3\]/g, '<h3>')
    html = html.replace(/\[\/h3\]/g, '</h3>')

    // 8. Paragraphs
    html = html.replace(/\[p\]/g, '<p>')
    html = html.replace(/\[\/p\]/g, '</p>')

    // 9. Lists
    html = html.replace(/\[li\]/g, '<li>')
    html = html.replace(/\[\/li\]/g, '</li>')
    html = html.replace(/\[ul\]/g, '<ul>')
    html = html.replace(/\[\/ul\]/g, '</ul>')
    html = html.replace(/\[ol\]/g, '<ol>')
    html = html.replace(/\[\/ol\]/g, '</ol>')

    // 10. Horizontal Rule
    html = html.replace(/\[hr\]/g, '<hr class="content-hr">')

    // 11. Tables
    // [table][tr][th]Header[/th][th]Header2[/th][/tr][tr][td]Cell[/td][td]Cell2[/td][/tr][/table]
    html = html.replace(/\[table\]/g, '<table class="note-table"><tbody>')
    html = html.replace(/\[\/table\]/g, '</tbody></table>')
    html = html.replace(/\[tr\]/g, '<tr>')
    html = html.replace(/\[\/tr\]/g, '</tr>')
    html = html.replace(/\[th\]/g, '<th>')
    html = html.replace(/\[\/th\]/g, '</th>')
    html = html.replace(/\[td\]/g, '<td>')
    html = html.replace(/\[\/td\]/g, '</td>')

    // 11. Forgiving pass — catch AI typos like [li> or [b> (angle bracket instead of square bracket close)
    html = html.replace(/\[li>/g, '<li>')
    html = html.replace(/\[\/li>/g, '</li>')
    html = html.replace(/\[ul>/g, '<ul>')
    html = html.replace(/\[\/ul>/g, '</ul>')
    html = html.replace(/\[ol>/g, '<ol>')
    html = html.replace(/\[\/ol>/g, '</ol>')
    html = html.replace(/\[p>/g, '<p>')
    html = html.replace(/\[\/p>/g, '</p>')
    html = html.replace(/\[b>/g, '<strong>')
    html = html.replace(/\[\/b>/g, '</strong>')
    html = html.replace(/\[i>/g, '<em>')
    html = html.replace(/\[\/i>/g, '</em>')
    html = html.replace(/\[h1>/g, '<h1>')
    html = html.replace(/\[\/h1>/g, '</h1>')
    html = html.replace(/\[h2>/g, '<h2>')
    html = html.replace(/\[\/h2>/g, '</h2>')
    html = html.replace(/\[h3>/g, '<h3>')
    html = html.replace(/\[\/h3>/g, '</h3>')

    // 12. Final safety cleanup — strip any remaining [tag] or [/tag] or [tag:value] that were not converted
    // This prevents raw tag syntax from showing as literal text in the editor
    html = html.replace(/\[\/?\w+(?::[^\]>]*)?\]/g, '')
    html = html.replace(/\[\/?\w+(?::[^\]>]*)?>/g, '')

    return html
}

/**
 * fixAiMistakes — pure logic cleanup of AI-generated HTML in the Tiptap editor.
 * No AI needed. Works in two phases:
 *   Phase 1: DOM-based structural fix (handles [li> items packed inside one <li>)
 *   Phase 2: String-level cleanup (markdown artifacts, empty paragraphs, etc.)
 */
export function fixAiMistakes(html: string): string {
    if (!html) return ''
    if (typeof window === 'undefined') return customToHtml(html)

    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // ── Helper: normalise tag syntax on an HTML string ──────────────────────────
    // Converts [li&gt; / [li> / [li] all to a canonical [li] so splits work uniformly
    function normaliseTags(s: string): string {
        return s
            .replace(/\[li&gt;/g,    '[li]').replace(/\[\/li&gt;/g,  '[/li]')
            .replace(/\[li>/g,       '[li]').replace(/\[\/li>/g,      '[/li]')
            .replace(/\[ol&gt;/g,    '[ol]').replace(/\[\/ol&gt;/g,   '[/ol]')
            .replace(/\[ol>/g,       '[ol]').replace(/\[\/ol>/g,       '[/ol]')
            .replace(/\[ul&gt;/g,    '[ul]').replace(/\[\/ul&gt;/g,   '[/ul]')
            .replace(/\[ul>/g,       '[ul]').replace(/\[\/ul>/g,       '[/ul]')
            .replace(/\[b&gt;/g,     '[b]').replace(/\[\/b&gt;/g,     '[/b]')
            .replace(/\[b>/g,        '[b]').replace(/\[\/b>/g,         '[/b]')
            .replace(/\[i&gt;/g,     '[i]').replace(/\[\/i&gt;/g,     '[/i]')
            .replace(/\[i>/g,        '[i]').replace(/\[\/i>/g,         '[/i]')
            .replace(/\[u&gt;/g,     '[u]').replace(/\[\/u&gt;/g,     '[/u]')
            .replace(/\[u>/g,        '[u]').replace(/\[\/u>/g,         '[/u]')
            .replace(/\[p&gt;/g,     '[p]').replace(/\[\/p&gt;/g,     '[/p]')
            .replace(/\[p>/g,        '[p]').replace(/\[\/p>/g,         '[/p]')
            .replace(/\[h1&gt;/g,    '[h1]').replace(/\[\/h1&gt;/g,   '[/h1]')
            .replace(/\[h1>/g,       '[h1]').replace(/\[\/h1>/g,       '[/h1]')
            .replace(/\[h2&gt;/g,    '[h2]').replace(/\[\/h2&gt;/g,   '[/h2]')
            .replace(/\[h2>/g,       '[h2]').replace(/\[\/h2>/g,       '[/h2]')
            .replace(/\[h3&gt;/g,    '[h3]').replace(/\[\/h3&gt;/g,   '[/h3]')
            .replace(/\[h3>/g,       '[h3]').replace(/\[\/h3>/g,       '[/h3]')
            .replace(/\[hr&gt;/g,    '[hr]').replace(/\[hr>/g,         '[hr]')
            .replace(/\[hl:#([a-fA-F0-9]+)&gt;/g, '[hl:#$1]')
            .replace(/\[hl:#([a-fA-F0-9]+)>/g,    '[hl:#$1]')
            .replace(/\[box:(\w+)&gt;/g, '[box:$1]').replace(/\[box:(\w+)>/g, '[box:$1]')
    }

    // ── Phase 1A: Fix <li> elements that contain packed [li] patterns ───────────
    // e.g. Tiptap creates one <li> containing "[li>item1 [li>item2 [li>item3"
    // We need to split these into proper sibling <li> elements.
    const allLis = Array.from(doc.querySelectorAll('li'))
    for (const li of allLis) {
        const textContent = li.textContent || ''
        // Check if this <li> has [li patterns inside its text
        if (!/\[li/.test(textContent)) continue

        const parent = li.parentNode
        if (!parent) continue

        // Tiptap wraps li content in <p> — strip that wrapper before splitting
        // so we don't get a stray '<p>' fragment as a false list item
        const rawInner = li.innerHTML.replace(/^<p>/, '').replace(/<\/p>$/, '')

        // Normalise the innerHTML so all variants become [li]
        const normalised = normaliseTags(rawInner)
        if (!/\[li\]/.test(normalised)) continue

        // Split by [li] opening tag boundaries
        // Filter: only keep parts that have actual text (not just stray HTML tags)
        const parts = normalised.split('[li]')
            .map(p => p.replace(/\[\/li\]/g, '').replace(/^<p>/, '').replace(/<\/p>$/, '').trim())
            .filter(p => p.replace(/<[^>]*>/g, '').trim().length > 0)

        if (parts.length === 0) { parent.removeChild(li); continue }

        // Create new <li> for each part and insert before original
        const frag = doc.createDocumentFragment()
        for (const part of parts) {
            const newLi = doc.createElement('li')
            newLi.innerHTML = customToHtml(part)
            frag.appendChild(newLi)
        }
        parent.replaceChild(frag, li)
    }

    // ── Phase 1B: Fix <p> elements that contain packed [li] patterns ─────────────
    // e.g. <p>[li>item1 [li>item2</p> → <ul><li>item1</li><li>item2</li></ul>
    const allPs = Array.from(doc.querySelectorAll('p'))
    for (const p of allPs) {
        const textContent = p.textContent || ''
        if (!/\[li/.test(textContent)) continue

        const parent = p.parentNode
        if (!parent) continue

        const normalised = normaliseTags(p.innerHTML)
        if (!/\[li\]/.test(normalised)) continue

        const parts = normalised.split('[li]')
            .map(part => part.replace(/\[\/li\]/g, '').replace(/^<p>/, '').replace(/<\/p>$/, '').trim())
            .filter(part => part.replace(/<[^>]*>/g, '').trim().length > 0)

        if (parts.length === 0) { parent.removeChild(p); continue }

        const ul = doc.createElement('ul')
        for (const part of parts) {
            const li = doc.createElement('li')
            li.innerHTML = customToHtml(part)
            ul.appendChild(li)
        }
        parent.replaceChild(ul, p)
    }

    // ── Phase 1C: Fix remaining text nodes with other [tag] patterns ─────────────
    // (headings, bold, italic, highlights etc. that are literal text in the editor)
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT)
    const textNodes: Text[] = []
    let n = walker.nextNode()
    while (n) {
        if (/\[/.test(n.textContent || '')) textNodes.push(n as Text)
        n = walker.nextNode()
    }
    for (const textNode of textNodes) {
        const raw = textNode.textContent || ''
        if (!/\[/.test(raw)) continue
        const normalised = normaliseTags(raw)
        const converted = customToHtml(normalised)
        if (converted === raw) continue
        const span = doc.createElement('span')
        span.innerHTML = converted
        textNode.parentNode?.replaceChild(span, textNode)
    }

    // ── Phase 1D: Remove empty <li> elements left over ───────────────────────────
    Array.from(doc.querySelectorAll('li')).forEach(li => {
        if (!li.textContent?.trim()) li.remove()
    })

    let h = doc.body.innerHTML

    // ── Phase 2: String-level fixes ──────────────────────────────────────────────

    // Markdown bold / italic / code
    h = h.replace(/\*\*([^*<\n]+?)\*\*/g, '<strong>$1</strong>')
    h = h.replace(/(?<!\*)\*([^*<\n]+?)\*(?!\*)/g, '<em>$1</em>')
    h = h.replace(/`([^`<\n]+?)`/g, '<code>$1</code>')

    // Markdown headings inside <p>
    h = h.replace(/<p>\s*#{3}\s+(.+?)<\/p>/gi, '<h3>$1</h3>')
    h = h.replace(/<p>\s*#{2}\s+(.+?)<\/p>/gi, '<h2>$1</h2>')
    h = h.replace(/<p>\s*#\s+(.+?)<\/p>/gi, '<h1>$1</h1>')

    // Markdown horizontal rules
    h = h.replace(/<p>\s*-{3,}\s*<\/p>/g, '<hr>')
    h = h.replace(/<p>\s*_{3,}\s*<\/p>/g, '<hr>')

    // Markdown bullet lines inside <p> → <ul>
    h = h.replace(/(<p>\s*[-•]\s+.+?<\/p>(\s*<p>\s*[-•]\s+.+?<\/p>)*)/gs, (match) => {
        const items = match.replace(/<p>\s*[-•]\s+(.+?)<\/p>/gs, '<li>$1</li>')
        return `<ul>${items}</ul>`
    })

    // Markdown numbered lines inside <p> → <ol>
    h = h.replace(/(<p>\s*\d+[.)]\s+.+?<\/p>(\s*<p>\s*\d+[.)]\s+.+?<\/p>)*)/gs, (match) => {
        const items = match.replace(/<p>\s*\d+[.)]\s+(.+?)<\/p>/gs, '<li>$1</li>')
        return `<ol>${items}</ol>`
    })

    // Remove empty paragraphs
    h = h.replace(/<p>\s*<\/p>/g, '')
    h = h.replace(/<p>\s*<br\s*\/?>\s*<\/p>/g, '')

    // Fix double spaces
    h = h.replace(/ {2,}/g, ' ')

    // Fix double-encoded entities
    h = h.replace(/&amp;amp;/g, '&amp;')
    h = h.replace(/&amp;lt;/g, '&lt;')
    h = h.replace(/&amp;gt;/g, '&gt;')

    // Strip any surviving [tag] remnants
    h = h.replace(/\[\/?\w+(?::[^\]>]*)?\]/g, '')
    h = h.replace(/\[\/?\w+(?::[^\]>]*)?&gt;/g, '')

    return h
}

/**
 * fixNestedHighlights — strips inner [hl:Y] when nested inside [hl:X].
 * The AI system prompt forbids nesting but still produces it occasionally.
 * Runs in a loop until no more nesting exists (handles multi-level nesting).
 * Pure string operation — safe to call on server side.
 */
export function fixNestedHighlights(content: string): string {
  let prev = ''
  while (prev !== content) {
    prev = content
    content = content.replace(
      /\[hl:(#[a-fA-F0-9]+)\]([^\[]*?)\[hl:(#[a-fA-F0-9]+)\]([\s\S]*?)\[\/hl\]([^\[]*?)\[\/hl\]/g,
      '[hl:$1]$2$4$5[/hl]'
    )
  }
  return content
}
