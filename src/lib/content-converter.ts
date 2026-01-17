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

export function htmlToCustom(html: string): string {
    if (!html) return ''
    if (typeof window === 'undefined') return html // Server-side fallback (should satisfy build)

    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')

    // Order matters! Process deepest/inline nodes first, then blocks, then containers.
    // This ensures that when we replace a container's outerHTML, the children inside 
    // are already converted to strings and preserved.

    // ========== INLINE ELEMENTS ==========

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

    // 10. Note Boxes (process last so children are already converted)
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

export function customToHtml(text: string): string {
    if (!text) return ''
    
    let html = text

    // ========== CONTAINERS ==========

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
    html = html.replace(/\[size:(\d+(?:px|pt|em|rem)?)\]/g, '<span style="font-size:$1">')
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

    // Newlines to BR (for text outside P tags)
    // But be careful not to break nested tags
    
    return html
}
