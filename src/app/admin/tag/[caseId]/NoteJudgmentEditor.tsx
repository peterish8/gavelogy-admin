'use client'

import { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react'
import Link from 'next/link'
import { insertLink, deleteLink, clearItemPdfUrl } from '@/actions/judgment/links'
import { saveNoteContent } from '@/actions/judgment/note-content'
import type { NotePdfLink } from '@/actions/judgment/links'
import { customToHtml, htmlToCustom } from '@/lib/content-converter'
import { encodeLinkMeta, parseLinkMeta, DEFAULT_LINK_COLOR } from '@/components/course/judgment-pdf-panel'
import { hexToRgba, findTextInPageData } from '@/lib/pdf-search'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import TagModal from './TagModal'
import {
  ArrowLeft, Upload, Save, Link2, X, Loader2, FileText, Trash2, CheckCircle, Trash,
  ChevronDown, Unlink, Eye, Pencil, Wand2,
} from 'lucide-react'
import { toast } from 'sonner'

const SCALE = 1.3

interface Region {
  page: number
  x: number
  y: number
  width: number
  height: number
}

interface Props {
  caseId: string
  caseTitle: string
  initialSignedUrl: string | null
  initialLinks: NotePdfLink[]
  noteContentHtml: string
}

// Full split-panel workspace: editable case law note on the left, pdfjs judgment viewer on the right with drag-tag and link overlay.
export default function NoteJudgmentEditor({
  caseId,
  caseTitle,
  initialSignedUrl,
  initialLinks,
  noteContentHtml,
}: Props) {
  // ── Note editor ────────────────────────────────────────────────────
  const noteEditorRef = useRef<HTMLDivElement>(null)
  const [noteDirty, setNoteDirty] = useState(false)
  const [savingNote, setSavingNote] = useState(false)
  const [noteMode, setNoteMode] = useState<'edit' | 'preview'>('edit')
  // Snapshot of editor HTML captured when switching to preview (ref becomes null after unmount)
  const [previewHtml, setPreviewHtml] = useState(() => customToHtml(noteContentHtml))

  // Captures the current editor HTML before switching to preview so the rendered view stays in sync.
  function switchNoteMode(mode: 'edit' | 'preview') {
    if (mode === 'preview' && noteEditorRef.current) {
      setPreviewHtml(noteEditorRef.current.innerHTML)
    }
    setNoteMode(mode)
  }

  const [selToolbar, setSelToolbar] = useState<{ viewportRect: DOMRect } | null>(null)
  const [linkIdInput, setLinkIdInput] = useState('')
  const [linking, setLinking] = useState<{ linkId: string } | null>(null)
  const [savingLink, setSavingLink] = useState(false)

  // ── Connect mode ───────────────────────────────────────────────────
  const [connectMode, setConnectMode] = useState(false)
  const [connectStep, setConnectStep] = useState<'note' | 'pdf' | null>(null)
  const [connectNoteCapture, setConnectNoteCapture] = useState<{
    text: string
    linkId: string
  } | null>(null)
  const [connectPdfCapture, setConnectPdfCapture] = useState<{
    page: number
    x: number
    y: number
    width: number
    height: number
    text: string
  } | null>(null)

  // ── Layout: view toggle + resizable divider ───────────────────────
  const [viewMode, setViewMode] = useState<'split' | 'notes' | 'pdf'>('split')
  const [splitPct, setSplitPct] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  // Tracks mouse drag on the divider handle to resize the note/PDF split percentage (clamped 28%–72%).
  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!draggingRef.current || !containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const pct = ((e.clientX - rect.left) / rect.width) * 100
      setSplitPct(Math.max(28, Math.min(72, pct)))
    }
    function onUp() { draggingRef.current = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [])

  // ── Reading progress (PDF scroll) ─────────────────────────────────
  const [readingProgress, setReadingProgress] = useState(0)

  // ── Tooltip ───────────────────────────────────────────────────────
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)

  // ── Navigation highlight + connection line ────────────────────────
  const [highlightedLinkId, setHighlightedLinkId] = useState<string | null>(null)
  const [connectionViz, setConnectionViz] = useState<{
    fromX: number; fromY: number; toX: number; toY: number; linkId: string
  } | null>(null)
  const noteScrollRef = useRef<HTMLDivElement>(null)
  const pdfScrollRef = useRef<HTMLDivElement>(null)

  // ── PDF state ──────────────────────────────────────────────────────
  const [signedUrl, setSignedUrl] = useState<string | null>(initialSignedUrl)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [deletingPdf, setDeletingPdf] = useState(false)
  const [numPages, setNumPages] = useState(0)
  const [pageStates, setPageStates] = useState<
    Record<number, { rendered: boolean; width: number; height: number }>
  >({})
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const pdfDocRef = useRef<any>(null)
  const pdfLibRef = useRef<any>(null)
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const pageContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const textLayerContainerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const renderedPages = useRef<Set<number>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [dragState, setDragState] = useState<{
    pageNum: number
    startX: number
    startY: number
    currentX: number
    currentY: number
    active: boolean
  } | null>(null)

  // ── Links ──────────────────────────────────────────────────────────
  const [links, setLinks] = useState<NotePdfLink[]>(initialLinks)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingRegion, setPendingRegion] = useState<Region | null>(null)
  const [showConnections, setShowConnections] = useState(false)

  // ── Init note editor ───────────────────────────────────────────────
  useEffect(() => {
    if (noteEditorRef.current) {
      noteEditorRef.current.innerHTML = customToHtml(noteContentHtml)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [generatingNotes, setGeneratingNotes] = useState(false)

  // ── Note handlers ──────────────────────────────────────────────────
  // Marks the note as having unsaved changes when the user types in the contenteditable editor.
  function handleNoteInput() {
    setNoteDirty(true)
    setSelToolbar(null)
  }

  // On text selection in the note: in connect mode wraps the selection in a linked-text span; otherwise shows the floating link toolbar.
  function handleNoteMouseUp() {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) {
      if (!connectMode) setSelToolbar(null)
      return
    }
    const range = sel.getRangeAt(0)
    const text = sel.toString().trim()

    // Connect mode step 1: insert span synchronously NOW, before any setState
    if (connectMode && connectStep === 'note') {
      const linkId = autoLinkId(text)

      // Range is still live — insert the span immediately before React re-renders
      const span = document.createElement('span')
      span.className = 'linked-text'
      span.setAttribute('data-link-id', linkId)
      span.style.cssText = 'color:#f59e0b;border-bottom:2px dashed #f59e0b;cursor:pointer;padding-bottom:1px'

      let insertedOk = false
      try {
        range.surroundContents(span)
        insertedOk = true
      } catch {
        try {
          const frag = range.extractContents()
          span.appendChild(frag)
          range.insertNode(span)
          insertedOk = true
        } catch (e2) {
          console.error('Span insertion failed:', e2)
        }
      }

      sel.removeAllRanges()

      if (!insertedOk) {
        toast.error('Could not capture that selection — try selecting text that does not cross formatting boundaries')
        return
      }

      // Span is in DOM — now safe to call setState (only strings, no Range)
      setConnectNoteCapture({ text, linkId })
      setConnectStep('pdf')
      toast.info('Note text captured — now select text in the PDF →')
      return
    }

    // Normal mode: show floating toolbar
    setSelToolbar({ viewportRect: range.getBoundingClientRect() })
    setLinkIdInput(autoLinkId(text))
  }

  // Computes viewport coordinates for both the note span and the PDF region so the SVG connection line can be drawn.
  function computeConnection(linkId: string): typeof connectionViz {
    const link = links.find(l => l.link_id === linkId)
    if (!link) return null
    const span = noteEditorRef.current?.querySelector(`[data-link-id="${linkId}"]`) as HTMLElement | null
    if (!span) return null
    const pageEl = pageContainerRefs.current.get(link.pdf_page)
    if (!pageEl) return null
    const spanRect = span.getBoundingClientRect()
    const pageRect = pageEl.getBoundingClientRect()
    const canvasH = pageStates[link.pdf_page]?.height ?? 792 * SCALE
    const regionTop = pageRect.top + (canvasH - (link.y + link.height) * SCALE)
    const regionH = link.height * SCALE
    return {
      fromX: spanRect.right,
      fromY: spanRect.top + spanRect.height / 2,
      toX: pageRect.left + link.x * SCALE,
      toY: regionTop + regionH / 2,
      linkId,
    }
  }

  // Scroll the PDF panel so the linked region appears near the top (not bottom)
  function scrollToLink(link: NotePdfLink) {
    const pdfContainer = pdfScrollRef.current
    const pageEl = pageContainerRefs.current.get(link.pdf_page)
    if (!pageEl || !pdfContainer) return
    const canvasH = pageStates[link.pdf_page]?.height ?? 792 * SCALE
    // Top of the highlighted box within the page (in screen pixels, relative to page container top)
    const regionTopOnPage = canvasH - (link.y + link.height) * SCALE
    // Page's current top relative to scroll container
    const containerRect = pdfContainer.getBoundingClientRect()
    const pageRect = pageEl.getBoundingClientRect()
    const pageTopInContainer = pageRect.top - containerRect.top + pdfContainer.scrollTop
    // Target: region appears 100px from the top of the PDF panel
    const target = Math.max(0, pageTopInContainer + regionTopOnPage - 100)
    pdfContainer.scrollTo({ top: target, behavior: 'smooth' })
  }

  // Clicking a linked-text span scrolls the PDF to the matched region and draws the connection line for 4 seconds.
  function handleNoteEditorClick(e: React.MouseEvent) {
    if (connectMode) return
    const span = (e.target as HTMLElement).closest('.linked-text') as HTMLElement | null
    if (!span) return
    const linkId = span.getAttribute('data-link-id')
    if (!linkId) return

    // Toggle: click active link again → dismiss
    if (highlightedLinkId === linkId) {
      setHighlightedLinkId(null)
      setConnectionViz(null)
      return
    }

    const link = links.find(l => l.link_id === linkId)
    if (!link) return

    scrollToLink(link)
    setHighlightedLinkId(linkId)
    // Wait for smooth scroll (~600ms) before drawing the line so coords are correct
    setTimeout(() => setConnectionViz(computeConnection(linkId)), 650)
    setTimeout(() => { setHighlightedLinkId(null); setConnectionViz(null) }, 4000)
  }

  // Recompute connection while panels are scrolling
  function redrawConnection(activeId?: string | null) {
    const id = activeId ?? highlightedLinkId ?? connectionViz?.linkId
    if (!id) return
    requestAnimationFrame(() => setConnectionViz(computeConnection(id)))
  }

  // When highlightedLinkId clears, also clear the viz
  useLayoutEffect(() => {
    if (!highlightedLinkId) setConnectionViz(null)
  }, [highlightedLinkId])

  // On hover over a linked-text span shows a tooltip and draws a preview connection line.
  function handleNoteEditorMouseMove(e: React.MouseEvent) {
    if (connectMode || highlightedLinkId) return
    const span = (e.target as HTMLElement).closest('.linked-text') as HTMLElement | null
    if (!span) { setConnectionViz(null); setTooltip(null); return }
    const linkId = span.getAttribute('data-link-id')
    if (!linkId) { setConnectionViz(null); setTooltip(null); return }

    // Show tooltip
    const link = links.find(l => l.link_id === linkId)
    if (link) {
      setTooltip({
        text: `→ Jump to page ${link.pdf_page}${link.label ? ` · ${parseLinkMeta(link.label).text}` : ''}`,
        x: e.clientX + 14,
        y: e.clientY - 36,
      })
    }

    if (connectionViz?.linkId === linkId) return
    setConnectionViz(computeConnection(linkId))
  }

  function handleNoteEditorMouseLeave() {
    if (!highlightedLinkId) { setConnectionViz(null) }
    setTooltip(null)
  }

  // Derives a URL-safe link ID from the first three words of the selected text (e.g. "link-ratio-held-case").
  function autoLinkId(text: string): string {
    const base = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .trim()
      .split(/\s+/)
      .slice(0, 3)
      .join('-')
    return `link-${base || Date.now()}`
  }

  // Wraps the current selection in a linked-text span with the typed link ID and enters linking mode waiting for a PDF drag.
  function handleStartLinking() {
    const id = linkIdInput.trim()
    if (!id || !selToolbar) return

    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0)
      const span = document.createElement('span')
      span.className = 'linked-text'
      span.setAttribute('data-link-id', id)
      span.style.cssText =
        'color:#f59e0b;border-bottom:2px dashed #f59e0b;cursor:pointer;padding-bottom:1px'
      try {
        range.surroundContents(span)
      } catch {
        const frag = range.extractContents()
        span.appendChild(frag)
        range.insertNode(span)
      }
      sel.removeAllRanges()
    }

    setLinking({ linkId: id })
    setSelToolbar(null)
    setNoteDirty(true)
    toast.info(`Drag on the PDF to connect "${id}"`)
  }

  // Injects [link:id] around the note anchor text found in the formatted string; headings take priority, longer anchors processed first.
  // Longer anchors are processed first to avoid partial matches.
  function injectLinkAnchors(
    formatted: string,
    connections: { linkId: string; noteAnchor: string }[],
  ): string {
    let result = formatted
    const sorted = [...connections].sort((a, b) => b.noteAnchor.length - a.noteAnchor.length)
    for (const conn of sorted) {
      if (!conn.noteAnchor || result.includes(`[link:${conn.linkId}]`)) continue
      const escaped = conn.noteAnchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const headingRe = new RegExp(`(\\[h[123]\\])(${escaped})(\\[/h[123]\\])`, 'i')
      if (headingRe.test(result)) {
        result = result.replace(headingRe, `$1[link:${conn.linkId}]$2[/link]$3`)
      } else {
        result = result.replace(new RegExp(escaped, 'i'), `[link:${conn.linkId}]${conn.noteAnchor}[/link]`)
      }
    }
    return result
  }

  async function handleGenerateFromPdf() {
    if (!pdfDocRef.current) { toast.error('Load a PDF first'); return }
    if (noteEditorRef.current?.textContent?.trim()) {
      if (!confirm('This will replace your existing notes and connections. Continue?')) return
    }
    setGeneratingNotes(true)
    const toastId = toast.loading('📄 Extracting PDF text…')
    try {
      // Extract text + item positions for coordinate search
      const parts: string[] = []
      const pageData: { pageNum: number; items: any[] }[] = []
      for (let p = 1; p <= pdfDocRef.current.numPages; p++) {
        const page = await pdfDocRef.current.getPage(p)
        const content = await page.getTextContent()
        const items = content.items as any[]
        pageData.push({ pageNum: p, items })
        parts.push(`[Page ${p}]\n${items.map((it: any) => it.str).join(' ')}`)
      }

      toast.loading('✨ AI is generating notes…', { id: toastId })

      const res = await fetch('/api/ai-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfText: parts.join('\n\n') }),
      })
      const json = await res.json()
      if (!res.ok || !json.formatted) throw new Error(json.error || 'AI returned no content')

      toast.loading('🔗 Creating connections…', { id: toastId })

      const aiConnections: any[] = Array.isArray(json.connections) ? json.connections : []

      await Promise.allSettled(links.map(l => deleteLink(l.id)))

      // Find real PDF coordinates for each connection and insert
      let formattedWithLinks = json.formatted
      const createdLinks: NotePdfLink[] = []
      for (const conn of aiConnections) {
        try {
          const pos = findTextInPageData(pageData, conn.pdfSearchText ?? '', conn.pdfPage)
          if (!pos) { console.debug('[generate] not found:', conn.linkId, conn.pdfSearchText); continue }
          const label = encodeLinkMeta(conn.label ?? '', conn.color ?? DEFAULT_LINK_COLOR)
          const newLink = await insertLink({
            item_id: caseId,
            link_id: conn.linkId,
            pdf_page: pos.page,
            x: pos.x,
            y: pos.y,
            width: pos.width,
            height: pos.height,
            label,
          })
          createdLinks.push(newLink)
        } catch (err) {
          console.warn('[generate] connection failed:', conn.linkId, err)
        }
      }

      // Inject [link:] anchors into note text
      const connectedLinks = createdLinks.map(l => ({ linkId: l.link_id, noteAnchor: aiConnections.find(c => c.linkId === l.link_id)?.noteAnchor ?? '' }))
      formattedWithLinks = injectLinkAnchors(formattedWithLinks, connectedLinks)

      const html = customToHtml(formattedWithLinks)
      if (noteEditorRef.current) noteEditorRef.current.innerHTML = html
      setPreviewHtml(html)
      await saveNoteContent(caseId, formattedWithLinks)
      setNoteDirty(false)
      setLinks(createdLinks)

      const msg = createdLinks.length > 0
        ? `✨ Notes + ${createdLinks.length} connections created!`
        : '✨ Notes generated'
      toast.success(msg + (json.provider ? ` via ${json.provider}` : ''), { id: toastId })
    } catch (err: any) {
      toast.error(err.message || 'Generation failed', { id: toastId })
    } finally {
      setGeneratingNotes(false)
    }
  }

  async function handleSaveNote() {
    if (!noteEditorRef.current) return
    setSavingNote(true)
    try {
      const customTags = htmlToCustom(noteEditorRef.current.innerHTML)
      await saveNoteContent(caseId, customTags)
      setNoteDirty(false)
      setPreviewHtml(noteEditorRef.current.innerHTML)
      toast.success('Note saved')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save')
    } finally {
      setSavingNote(false)
    }
  }

  // ── Connect mode handlers ──────────────────────────────────────────
  function startConnectMode() {
    setConnectMode(true)
    setConnectStep('note')
    setConnectNoteCapture(null)
    setConnectPdfCapture(null)
    setSelToolbar(null)
    setLinking(null)
    toast.info('Step 1: Select text in the note')
  }

  function exitConnectMode() {
    // If a pending span was inserted but not yet saved, unwrap it cleanly
    const noteEl = noteEditorRef.current
    if (noteEl && connectNoteCapture?.linkId && connectStep === 'pdf') {
      // Only unwrap if we're cancelling (not called from handleConnectSave after success)
      // We detect cancel by checking if no link exists in state for this linkId yet
      const alreadySaved = links.some(l => l.link_id === connectNoteCapture.linkId)
      if (!alreadySaved) {
        const pendingSpan = noteEl.querySelector(`[data-link-id="${connectNoteCapture.linkId}"]`)
        if (pendingSpan && pendingSpan.parentNode) {
          while (pendingSpan.firstChild) {
            pendingSpan.parentNode.insertBefore(pendingSpan.firstChild, pendingSpan)
          }
          pendingSpan.parentNode.removeChild(pendingSpan)
        }
      }
    }
    setConnectMode(false)
    setConnectStep(null)
    setConnectNoteCapture(null)
    setConnectPdfCapture(null)
  }

  function handlePdfTextMouseUp(e: React.MouseEvent, pageNum: number) {
    if (!connectMode || connectStep !== 'pdf' || connectPdfCapture) return

    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || !sel.toString().trim()) return

    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const pageEl = pageContainerRefs.current.get(pageNum)
    if (!pageEl) return
    const pageRect = pageEl.getBoundingClientRect()
    const canvas = canvasRefs.current.get(pageNum)
    const canvasH = canvas?.height || 792 * SCALE

    const mouseX = rect.left - pageRect.left
    const mouseY = rect.top - pageRect.top
    const mouseW = rect.width
    const mouseH = rect.height

    setConnectPdfCapture({
      page: pageNum,
      x: mouseX / SCALE,
      y: (canvasH - mouseY - mouseH) / SCALE,
      width: Math.max(mouseW / SCALE, 10),
      height: Math.max(mouseH / SCALE, 8),
      text: sel.toString().trim(),
    })
  }

  async function handleConnectSave() {
    if (!connectNoteCapture || !connectPdfCapture) return
    const { linkId } = connectNoteCapture
    const noteEl = noteEditorRef.current
    if (!noteEl) return
    setSavingLink(true)
    try {
      // Span was already inserted into the DOM synchronously in handleNoteMouseUp.
      // Just verify it is still there before saving.
      const existingSpan = noteEl.querySelector(`[data-link-id="${linkId}"]`)
      if (!existingSpan) {
        toast.error('Link span was lost — please try again')
        exitConnectMode()
        return
      }

      // Snapshot HTML — span is already inside it
      const htmlAfterInsert = noteEl.innerHTML

      const newLink = await insertLink({
        item_id: caseId,
        link_id: linkId,
        pdf_page: connectPdfCapture.page,
        x: connectPdfCapture.x,
        y: connectPdfCapture.y,
        width: connectPdfCapture.width,
        height: connectPdfCapture.height,
      })
      setLinks(prev => [...prev, newLink])

      const customTags = htmlToCustom(htmlAfterInsert)
      await saveNoteContent(caseId, customTags)
      setNoteDirty(false)
      setPreviewHtml(htmlAfterInsert)

      toast.success(`Connected "${linkId}"`)
      exitConnectMode()
    } catch (err: any) {
      toast.error(err.message || 'Failed to save connection')
    } finally {
      setSavingLink(false)
    }
  }

  // ── PDF upload ─────────────────────────────────────────────────────
  async function handlePdfUpload(file: File) {
    setUploadingPdf(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('caseId', caseId)
      const res = await fetch('/api/judgment/upload', {
        method: 'POST',
        body: formData,
      })
      const result = await res.json()
      if (!result.success) throw new Error(result.error || 'Upload failed')
      setSignedUrl(`/api/judgment/pdf-proxy?itemId=${caseId}&t=${Date.now()}`)
      toast.success('PDF uploaded')
    } catch (err: any) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploadingPdf(false)
    }
  }

  // ── PDF delete ─────────────────────────────────────────────────────
  async function handleDeletePdf() {
    if (!confirm('Remove this PDF? Tag coordinates are kept.')) return
    setDeletingPdf(true)
    try {
      await clearItemPdfUrl(caseId)
      setSignedUrl(null)
      setNumPages(0)
      setPageStates({})
      renderedPages.current.clear()
      pdfDocRef.current = null
      toast.success('PDF removed')
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove PDF')
    } finally {
      setDeletingPdf(false)
    }
  }

  // ── PDF rendering ──────────────────────────────────────────────────
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDocRef.current || renderedPages.current.has(pageNum)) return
    renderedPages.current.add(pageNum)
    try {
      const page = await pdfDocRef.current.getPage(pageNum)
      const viewport = page.getViewport({ scale: SCALE })
      const canvas = canvasRefs.current.get(pageNum)
      if (!canvas) return
      canvas.width = viewport.width
      canvas.height = viewport.height
      const ctx = canvas.getContext('2d')!
      await page.render({ canvasContext: ctx, viewport }).promise

      // Render text layer for selection
      const tlContainer = textLayerContainerRefs.current.get(pageNum)
      if (tlContainer && pdfLibRef.current?.TextLayer) {
        tlContainer.innerHTML = ''
        const tl = new pdfLibRef.current.TextLayer({
          textContentSource: page.streamTextContent(),
          container: tlContainer,
          viewport,
        })
        await tl.render()
      }

      setPageStates(prev => ({
        ...prev,
        [pageNum]: { rendered: true, width: viewport.width, height: viewport.height },
      }))
    } catch (err) {
      console.error(`Page ${pageNum} render error:`, err)
    }
  }, [])

  useEffect(() => {
    if (!signedUrl) return
    let cancelled = false
    async function load() {
      setPdfLoading(true)
      setPdfError(null)
      renderedPages.current.clear()
      setPageStates({})
      setNumPages(0)
      try {
        const pdfjsLib = await import('pdfjs-dist')
        pdfLibRef.current = pdfjsLib
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
        const doc = await pdfjsLib.getDocument(signedUrl!).promise
        if (cancelled) return
        pdfDocRef.current = doc
        setNumPages(doc.numPages)
      } catch (err: any) {
        if (!cancelled) setPdfError(err.message || 'Failed to load PDF')
      } finally {
        if (!cancelled) setPdfLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [signedUrl])

  useEffect(() => {
    if (numPages === 0) return
    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          const n = parseInt((entry.target as HTMLElement).dataset.pageNum || '0', 10)
          if (n > 0) renderPage(n)
        }
      }),
      { rootMargin: '200px' }
    )
    for (let i = 1; i <= numPages; i++) {
      const el = pageContainerRefs.current.get(i)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [numPages, renderPage])

  // ── Drag handlers (normal mode only) ──────────────────────────────
  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>, pageNum: number) {
    if (connectMode) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setDragState({
      pageNum,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      currentX: e.clientX - rect.left,
      currentY: e.clientY - rect.top,
      active: true,
    })
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragState?.active) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDragState(prev =>
      prev ? { ...prev, currentX: e.clientX - rect.left, currentY: e.clientY - rect.top } : null
    )
  }

  function handleMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragState?.active) return
    const rect = e.currentTarget.getBoundingClientRect()
    const endX = e.clientX - rect.left
    const endY = e.clientY - rect.top
    const mouseX = Math.min(dragState.startX, endX)
    const mouseY = Math.min(dragState.startY, endY)
    const mouseW = Math.abs(endX - dragState.startX)
    const mouseH = Math.abs(endY - dragState.startY)
    if (mouseW > 8 && mouseH > 8) {
      const canvas = canvasRefs.current.get(dragState.pageNum)
      if (canvas) {
        const pageHeightPdf = canvas.height / SCALE
        handleRegionSelected({
          page: dragState.pageNum,
          x: mouseX / SCALE,
          y: pageHeightPdf - mouseY / SCALE - mouseH / SCALE,
          width: mouseW / SCALE,
          height: mouseH / SCALE,
        })
      }
    }
    setDragState(null)
  }

  // ── Region selected ────────────────────────────────────────────────
  async function handleRegionSelected(region: Region) {
    if (linking) {
      setSavingLink(true)
      try {
        const newLink = await insertLink({
          item_id: caseId,
          link_id: linking.linkId,
          pdf_page: region.page,
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
        })
        setLinks(prev => [...prev, newLink])
        if (noteEditorRef.current) {
          const customTags = htmlToCustom(noteEditorRef.current.innerHTML)
          await saveNoteContent(caseId, customTags)
          setNoteDirty(false)
        }
        toast.success(`Connected "${linking.linkId}" → page ${region.page}`)
        setLinking(null)
      } catch (err: any) {
        toast.error(err.message || 'Failed to save connection')
      } finally {
        setSavingLink(false)
      }
    } else {
      setPendingRegion(region)
    }
  }

  async function handleModalSave(linkId: string, label: string) {
    if (!pendingRegion) return
    const newLink = await insertLink({
      item_id: caseId,
      link_id: linkId,
      pdf_page: pendingRegion.page,
      x: pendingRegion.x,
      y: pendingRegion.y,
      width: pendingRegion.width,
      height: pendingRegion.height,
      label: label || undefined,
    })
    setLinks(prev => [...prev, newLink])
    setPendingRegion(null)
    toast.success(`Tagged "${linkId}" on page ${pendingRegion.page}`)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      const linkToDelete = links.find(l => l.id === id)
      await deleteLink(id)
      setLinks(prev => prev.filter(l => l.id !== id))

      // Unwrap the linked span from the note editor — use innerHTML regex
      // (more reliable than DOM surgery on contentEditable elements)
      if (linkToDelete && noteEditorRef.current) {
        const safeId = linkToDelete.link_id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const spanRe = new RegExp(
          `<span[^>]*data-link-id="${safeId}"[^>]*>(.*?)<\\/span>`,
          'gi'
        )
        noteEditorRef.current.innerHTML = noteEditorRef.current.innerHTML.replace(
          spanRe,
          '$1'
        )
        const customTags = htmlToCustom(noteEditorRef.current.innerHTML)
        await saveNoteContent(caseId, customTags)
        setNoteDirty(false)
        setPreviewHtml(noteEditorRef.current.innerHTML)
      }

      // Clear any active connection for this link
      if (highlightedLinkId === linkToDelete?.link_id) {
        setHighlightedLinkId(null)
        setConnectionViz(null)
      }

      toast.success('Connection removed')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  function getNoteText(linkId: string): string {
    const el = noteEditorRef.current?.querySelector(`[data-link-id="${linkId}"]`)
    return el?.textContent?.trim() || linkId
  }

  const existingLinkIds = links.map(l => l.link_id)
  const selRect = dragState?.active ? {
    x: Math.min(dragState.startX, dragState.currentX),
    y: Math.min(dragState.startY, dragState.currentY),
    w: Math.abs(dragState.currentX - dragState.startX),
    h: Math.abs(dragState.currentY - dragState.startY),
  } : null

  const inPdfSelectStep = connectMode && connectStep === 'pdf'

  const gridCols = viewMode === 'split'
    ? `${splitPct}fr 5px ${100 - splitPct}fr`
    : viewMode === 'notes' ? '1fr 0 0' : '0 0 1fr'

  return (
    <div
      ref={containerRef}
      className="h-full overflow-hidden bg-background"
      style={{ display: 'grid', gridTemplateColumns: gridCols, gridTemplateRows: '1fr' }}
    >

      {/* ══ LEFT: Note Editor ══════════════════════════════════════════ */}
      <div className={cn('flex flex-col min-w-0 overflow-hidden', viewMode === 'notes' && 'col-span-3')}
        style={{ borderRight: '1px solid hsl(var(--border))' }}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-3">
            <Link
              href="/admin/tag"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Link>
            <div className="h-4 w-px bg-border" />
            <span className="font-bold text-sm text-foreground">{caseTitle}</span>
          </div>
          <div className="flex items-center gap-2">
            {/* Edit / Preview toggle */}
            <div className="flex gap-px p-0.5 rounded-md bg-muted">
              <button
                onClick={() => switchNoteMode('edit')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all',
                  noteMode === 'edit'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
              <button
                onClick={() => switchNoteMode('preview')}
                className={cn(
                  'flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all',
                  noteMode === 'preview'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Eye className="w-3 h-3" />
                Preview
              </button>
            </div>
            {/* View toggle */}
            <div className="flex gap-px p-0.5 rounded-md bg-muted">
              {(['split', 'notes', 'pdf'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-mono transition-all',
                    viewMode === m
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {m === 'split' ? '⣿' : m === 'notes' ? '≡' : '⬜'}
                </button>
              ))}
            </div>
            {/* Connect + Save — hidden in preview mode */}
            {noteMode === 'preview' && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground px-1">
                <Eye className="w-3.5 h-3.5" />
                Preview — click links to navigate
              </span>
            )}
            {noteMode === 'edit' && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleGenerateFromPdf}
                  disabled={generatingNotes || !signedUrl}
                  className="border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                >
                  {generatingNotes
                    ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                    : <Wand2 className="w-4 h-4 mr-1.5" />}
                  {generatingNotes ? 'Generating…' : 'Generate Notes'}
                </Button>
                <Button
                  size="sm"
                  variant={connectMode ? 'default' : 'outline'}
                  onClick={connectMode ? exitConnectMode : startConnectMode}
                  className={connectMode
                    ? 'bg-amber-500 hover:bg-amber-600 border-0 text-white'
                    : 'border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                  }
                >
                  <Link2 className="w-4 h-4 mr-1.5" />
                  {connectMode ? 'Cancel' : 'Connect'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveNote}
                  disabled={!noteDirty || savingNote}
                  variant={noteDirty ? 'default' : 'ghost'}
                  className={cn(!noteDirty && 'text-muted-foreground')}
                >
                  {savingNote ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : noteDirty ? (
                    <Save className="w-4 h-4 mr-2" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  {savingNote ? 'Saving…' : noteDirty ? 'Save Note' : 'Saved'}
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Connect mode banner — note side */}
        {connectMode && (
          <div className={cn(
            'px-4 py-2.5 border-b shrink-0 flex items-center justify-between',
            connectStep === 'note'
              ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/30'
              : 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/30'
          )}>
            {connectStep === 'note' && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200">1</span>
                <span className="text-xs text-amber-800 dark:text-amber-300">Select the text in the note you want to link</span>
              </div>
            )}
            {connectStep === 'pdf' && !connectPdfCapture && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">✓</span>
                <span className="text-xs text-green-800 dark:text-green-300">
                  <span className="font-medium">"{connectNoteCapture?.text}"</span> captured — now select text in the PDF →
                </span>
              </div>
            )}
            {connectStep === 'pdf' && connectPdfCapture && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-green-800 dark:text-green-300 font-medium">
                  "{connectNoteCapture?.text}" ↔ "{connectPdfCapture.text}"
                </span>
                <div className="flex gap-1.5 ml-auto">
                  <Button
                    size="sm"
                    className="h-6 text-xs bg-green-600 hover:bg-green-700 text-white border-0 px-2"
                    onClick={handleConnectSave}
                    disabled={savingLink}
                  >
                    {savingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Connect!'}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-xs px-2"
                    onClick={() => setConnectPdfCapture(null)}
                  >
                    Re-select
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Linking mode banner (normal mode) */}
        {linking && !connectMode && (
          <div className="flex items-center justify-between px-4 py-2 bg-amber-50 dark:bg-amber-950/20 border-b border-amber-200 dark:border-amber-800/30 shrink-0">
            <div className="flex items-center gap-2">
              <Link2 className="w-4 h-4 text-amber-600 dark:text-amber-400 animate-pulse" />
              <span className="text-xs text-amber-800 dark:text-amber-300">
                Linking{' '}
                <code className="font-mono px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-xs">
                  {linking.linkId}
                </code>
                {' '}→ now drag on the PDF
              </span>
            </div>
            <button
              onClick={() => setLinking(null)}
              className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Instruction hint — edit mode only */}
        {noteMode === 'edit' && !linking && !connectMode && (
          <div className="px-4 py-1.5 bg-muted/40 border-b border-border shrink-0">
            <p className="text-xs text-muted-foreground">
              <span className="text-amber-600 dark:text-amber-400 font-medium cursor-pointer" onClick={startConnectMode}>Connect</span> — select note text + PDF text to link them &nbsp;·&nbsp; or drag on PDF to tag a region &nbsp;·&nbsp; click a <span className="text-amber-500">highlighted word</span> to jump to its PDF location
            </p>
          </div>
        )}

        {/* Note body — editor or preview */}
        <div
          ref={noteScrollRef}
          className="flex-1 overflow-y-auto bg-card"
          onScroll={() => redrawConnection()}
        >
          {/* ── Editor — always mounted so ref + DOM content survive mode switches ── */}
          <div className="p-6" style={{ display: noteMode === 'edit' ? undefined : 'none' }}>
            <div
              ref={noteEditorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleNoteInput}
              onMouseUp={handleNoteMouseUp}
              onClick={handleNoteEditorClick}
              onMouseMove={handleNoteEditorMouseMove}
              onMouseLeave={handleNoteEditorMouseLeave}
              className="outline-none min-h-[200px] text-sm leading-relaxed text-foreground caret-primary"
            />
          </div>

          {/* ── Preview — shown when in preview mode ── */}
          {noteMode === 'preview' && (
            <div
              className="p-6 pb-10 text-sm leading-relaxed text-foreground select-text"
              onClick={handleNoteEditorClick}
              onMouseMove={handleNoteEditorMouseMove}
              onMouseLeave={handleNoteEditorMouseLeave}
              dangerouslySetInnerHTML={{
                __html: previewHtml,
              }}
            />
          )}
        </div>

        {/* ── Connections panel ─────────────────────────────────────── */}
        <div className="shrink-0 border-t border-border bg-card">
          {/* Toggle header */}
          <button
            onClick={() => setShowConnections(v => !v)}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Link2 className="w-3.5 h-3.5 text-amber-500" />
              <span className="text-xs font-semibold text-foreground">
                Connections
              </span>
              <span className={cn(
                'text-xs font-mono px-1.5 py-0.5 rounded-full border',
                links.length > 0
                  ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40'
                  : 'bg-muted text-muted-foreground border-border'
              )}>
                {links.length}
              </span>
            </div>
            <ChevronDown className={cn(
              'w-4 h-4 text-muted-foreground transition-transform duration-200',
              showConnections && 'rotate-180'
            )} />
          </button>

          {/* Connection cards */}
          {showConnections && (
            <div className="max-h-52 overflow-y-auto border-t border-border divide-y divide-border/50">
              {links.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <Unlink className="w-5 h-5 mx-auto mb-1.5 text-muted-foreground/40" />
                  <p className="text-xs text-muted-foreground">No connections yet</p>
                </div>
              ) : (
                links.map(link => {
                  const noteText = getNoteText(link.link_id)
                  const isActive = connectionViz?.linkId === link.link_id || highlightedLinkId === link.link_id
                  const { color: linkColor } = parseLinkMeta(link.label)
                  return (
                    <div
                      key={link.id}
                      onClick={() => {
                        scrollToLink(link)
                        setHighlightedLinkId(link.link_id)
                        setTimeout(() => setConnectionViz(computeConnection(link.link_id)), 650)
                        setTimeout(() => { setHighlightedLinkId(null); setConnectionViz(null) }, 4000)
                      }}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer group transition-colors hover:bg-muted/50"
                      style={isActive ? { backgroundColor: hexToRgba(linkColor, 0.08) } : undefined}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0 transition-colors"
                        style={{ backgroundColor: isActive ? linkColor : hexToRgba(linkColor, 0.45) }}
                      />

                      {/* Text info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-medium truncate" style={{ color: linkColor }}>
                            "{noteText}"
                          </span>
                          <span className="text-muted-foreground/40 text-xs shrink-0">→</span>
                          <span className="text-xs text-muted-foreground shrink-0">
                            p.{link.pdf_page}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground/60 font-mono truncate mt-0.5">
                          {link.link_id}
                        </div>
                      </div>

                      {/* Delete */}
                      <button
                        onClick={e => { e.stopPropagation(); handleDelete(link.id) }}
                        disabled={deletingId === link.id}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-30 shrink-0"
                        title="Remove connection"
                      >
                        {deletingId === link.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ RESIZABLE DIVIDER ══════════════════════════════════════════ */}
      <div
        className={cn(
          'flex items-center justify-center cursor-col-resize hover:bg-primary/20 transition-colors group relative z-10',
          viewMode !== 'split' && 'hidden'
        )}
        style={{ background: 'hsl(var(--border))' }}
        onMouseDown={() => { draggingRef.current = true }}
      >
        <div className="w-0.5 h-8 rounded-full bg-border group-hover:bg-primary/60 transition-colors" />
      </div>

      {/* ══ RIGHT: PDF Panel ════════════════════════════════════════════ */}
      <div className={cn('flex flex-col min-w-0 overflow-hidden', viewMode === 'pdf' && 'col-span-3')}>

        {/* Header */}
        <div className="relative flex items-center justify-between px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2">
            {/* View toggle — visible here when in PDF-only mode */}
            <div className="flex gap-px p-0.5 rounded-md bg-muted">
              {(['split', 'notes', 'pdf'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className={cn(
                    'px-2.5 py-1 rounded text-xs font-mono transition-all',
                    viewMode === m
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  {m === 'split' ? '⣿' : m === 'notes' ? '≡' : '⬜'}
                </button>
              ))}
            </div>
            <span className="font-bold text-sm text-foreground">Judgment PDF</span>
            {links.length > 0 && (
              <span className="flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                {links.length} linked
              </span>
            )}
          </div>
          {/* Reading progress bar */}
          {readingProgress > 0 && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-border">
              <div
                className="h-full bg-primary/60 transition-all duration-100"
                style={{ width: `${readingProgress}%` }}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handlePdfUpload(f)
                e.target.value = ''
              }}
            />
            {signedUrl && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDeletePdf}
                disabled={deletingPdf}
                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                title="Remove PDF"
              >
                {deletingPdf
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Trash className="w-4 h-4" />
                }
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingPdf || deletingPdf}
            >
              {uploadingPdf ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Upload className="w-4 h-4 mr-2" />
              )}
              {uploadingPdf ? 'Uploading…' : signedUrl ? 'Replace PDF' : 'Upload PDF'}
            </Button>
          </div>
        </div>

        {/* Connect mode step 2 banner — PDF side */}
        {inPdfSelectStep && (
          <div className={cn(
            'px-4 py-2 border-b shrink-0 flex items-center gap-2',
            connectPdfCapture
              ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/30'
              : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/30'
          )}>
            <span className={cn(
              'text-xs font-semibold px-1.5 py-0.5 rounded',
              connectPdfCapture
                ? 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
                : 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
            )}>2</span>
            <span className={cn('text-xs', connectPdfCapture
              ? 'text-green-800 dark:text-green-300'
              : 'text-blue-800 dark:text-blue-300'
            )}>
              {connectPdfCapture
                ? `PDF text captured: "${connectPdfCapture.text.slice(0, 40)}${connectPdfCapture.text.length > 40 ? '…' : ''}"`
                : 'Select the matching text in the judgment PDF below'
              }
            </span>
          </div>
        )}

        {/* Linking instruction on PDF side (normal mode) */}
        {linking && !connectMode && (
          <div className="px-4 py-2 bg-green-50 dark:bg-green-950/20 border-b border-green-200 dark:border-green-800/30 shrink-0 text-center">
            <span className="text-xs text-green-700 dark:text-green-400">
              Draw a rectangle around the matching passage in the PDF
            </span>
          </div>
        )}

        {/* PDF body */}
        <div
          ref={pdfScrollRef}
          className="flex-1 overflow-hidden bg-muted/50"
          onScroll={e => {
            const el = e.currentTarget
            const pct = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100
            setReadingProgress(Math.min(100, pct || 0))
            redrawConnection()
          }}
        >
          {!signedUrl ? (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
                <FileText className="w-8 h-8 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">No judgment PDF yet</p>
                <p className="text-xs text-muted-foreground mt-1">Upload a PDF to start tagging passages</p>
              </div>
              <Button onClick={() => fileInputRef.current?.click()} size="sm">
                <Upload className="w-4 h-4 mr-2" />
                Upload PDF
              </Button>
            </div>
          ) : pdfLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-3 text-primary" />
                <p className="text-sm text-muted-foreground">Loading PDF…</p>
              </div>
            </div>
          ) : pdfError ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-destructive">Failed to load: {pdfError}</p>
            </div>
          ) : (
            <div className="overflow-y-auto h-full">
              <div className="flex flex-col items-center gap-6 py-6 px-4">
                {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => {
                  const pageLinks = links.filter(l => l.pdf_page === pageNum)
                  const ps = pageStates[pageNum]
                  const canvasW = ps?.width || 612 * SCALE
                  const canvasH = ps?.height || 792 * SCALE

                  return (
                    <div key={pageNum} className="flex flex-col items-center">
                      <p className="text-xs font-semibold uppercase tracking-widest mb-2 text-muted-foreground">
                        Page {pageNum}
                      </p>
                      <div
                        ref={el => { if (el) pageContainerRefs.current.set(pageNum, el) }}
                        data-page-num={pageNum}
                        className="relative rounded-sm overflow-hidden border border-border shadow-sm bg-white"
                        style={{ width: canvasW, height: canvasH }}
                      >
                        <canvas
                          ref={el => { if (el) canvasRefs.current.set(pageNum, el) }}
                          style={{ display: 'block' }}
                        />

                        {/* Text layer for connect mode selection */}
                        <div
                          ref={el => { if (el) textLayerContainerRefs.current.set(pageNum, el) }}
                          className={cn('pdfTextLayer', inPdfSelectStep && !connectPdfCapture && 'selectable')}
                          onMouseUp={e => handlePdfTextMouseUp(e, pageNum)}
                        />

                        {/* Existing link overlays */}
                        {ps?.rendered && pageLinks.map(link => {
                          const sx = link.x * SCALE
                          const sy = canvasH - (link.y + link.height) * SCALE
                          const sw = link.width * SCALE
                          const sh = link.height * SCALE
                          const isActive = linking?.linkId === link.link_id
                          const isHighlighted = highlightedLinkId === link.link_id
                          const isConnected = connectionViz?.linkId === link.link_id
                          const { text: ovLabel, color: ovColor } = parseLinkMeta(link.label)

                          return (
                            <div
                              key={link.id}
                              title={`${link.link_id}${ovLabel ? ` — ${ovLabel}` : ''}`}
                              className={cn('absolute group', isHighlighted && 'link-flash')}
                              style={{
                                left: sx, top: sy, width: sw, height: sh,
                                background: isHighlighted
                                  ? hexToRgba(ovColor, 0.35)
                                  : isConnected
                                  ? hexToRgba(ovColor, 0.22)
                                  : isActive
                                  ? hexToRgba(ovColor, 0.28)
                                  : hexToRgba(ovColor, 0.12),
                                border: `${isHighlighted || isConnected ? '2' : '1.5'}px solid ${isHighlighted || isConnected || isActive ? ovColor : hexToRgba(ovColor, 0.45)}`,
                                boxShadow: isConnected || isHighlighted ? `0 0 0 3px ${hexToRgba(ovColor, 0.2)}` : undefined,
                                borderRadius: 3,
                                zIndex: isConnected ? 7 : 5,
                                pointerEvents: inPdfSelectStep ? 'none' : 'all',
                                transition: 'background 0.2s, box-shadow 0.2s',
                              }}
                            >
                              {!inPdfSelectStep && (
                                <>
                                  <button
                                    onClick={() => handleDelete(link.id)}
                                    disabled={deletingId === link.id}
                                    className="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground disabled:opacity-50"
                                  >
                                    <Trash2 className="w-2.5 h-2.5" />
                                  </button>
                                  <div className="absolute bottom-full left-0 mb-1 px-2 py-1 rounded-md text-xs font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 bg-popover text-popover-foreground border border-border shadow-md">
                                    {link.link_id}
                                    {link.label && <span className="text-muted-foreground"> — {parseLinkMeta(link.label).text}</span>}
                                  </div>
                                </>
                              )}
                            </div>
                          )
                        })}

                        {/* Drag overlay — only in normal mode */}
                        {!connectMode && (
                          <div
                            className="absolute inset-0"
                            style={{ cursor: 'crosshair', zIndex: 10 }}
                            onMouseDown={e => handleMouseDown(e, pageNum)}
                            onMouseMove={dragState?.pageNum === pageNum ? handleMouseMove : undefined}
                            onMouseUp={dragState?.pageNum === pageNum ? handleMouseUp : undefined}
                            onMouseLeave={dragState?.pageNum === pageNum ? () => setDragState(null) : undefined}
                          />
                        )}

                        {/* Live selection rectangle (normal drag mode) */}
                        {dragState?.active && dragState.pageNum === pageNum && selRect && (
                          <div
                            className="absolute pointer-events-none"
                            style={{
                              left: selRect.x, top: selRect.y,
                              width: selRect.w, height: selRect.h,
                              border: `2px dashed ${linking ? '#22c55e' : '#3b82f6'}`,
                              background: linking ? 'rgba(34,197,94,0.08)' : 'rgba(59,130,246,0.08)',
                              zIndex: 20,
                            }}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* TagModal — PDF-first flow */}
      {pendingRegion && (
        <TagModal
          region={pendingRegion}
          existingLinkIds={existingLinkIds}
          noteContentLinkIds={existingLinkIds}
          onSave={handleModalSave}
          onClose={() => setPendingRegion(null)}
        />
      )}

      {/* ── Tooltip ───────────────────────────────────────────────── */}
      {tooltip && (
        <div
          className="fixed z-200 pointer-events-none px-3 py-1.5 rounded-lg text-xs font-mono bg-popover text-popover-foreground border border-border shadow-lg"
          style={{ left: tooltip.x, top: tooltip.y, borderLeft: '3px solid hsl(var(--primary))' }}
        >
          {tooltip.text}
        </div>
      )}

      {/* ── SVG connection curve overlay ───────────────────────────── */}
      {connectionViz && (() => {
        const { fromX, fromY, toX, toY } = connectionViz
        const dx = Math.max((toX - fromX) * 0.45, 60)
        const path = `M ${fromX} ${fromY} C ${fromX + dx} ${fromY}, ${toX - dx} ${toY}, ${toX} ${toY}`
        const isClick = !!highlightedLinkId
        return (
          <svg
            style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 40 }}
            aria-hidden
          >
            <defs>
              <marker id="conn-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
                <path d="M0,0 L7,3.5 L0,7 Z" fill="rgba(245,158,11,0.85)" />
              </marker>
              <filter id="conn-glow">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            {/* Glow layer */}
            <path
              d={path}
              fill="none"
              stroke="rgba(245,158,11,0.25)"
              strokeWidth="6"
              filter="url(#conn-glow)"
            />
            {/* Main dashed line */}
            <path
              d={path}
              fill="none"
              stroke={isClick ? 'rgba(245,158,11,0.9)' : 'rgba(245,158,11,0.6)'}
              strokeWidth={isClick ? '2' : '1.5'}
              strokeDasharray="6 4"
              markerEnd="url(#conn-arrow)"
              style={isClick ? { animation: 'dash-flow 0.4s linear infinite' } : undefined}
            />
            {/* Dot at origin */}
            <circle cx={fromX} cy={fromY} r="4" fill="rgba(245,158,11,0.8)" />
          </svg>
        )
      })()}

      {/* Saving overlay */}
      {savingLink && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-card border border-border shadow-lg">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm font-medium text-foreground">Saving connection…</span>
          </div>
        </div>
      )}

      {/* Floating selection toolbar (normal mode) */}
      {selToolbar && !connectMode && (
        <SelectionToolbar
          viewportRect={selToolbar.viewportRect}
          linkId={linkIdInput}
          existingIds={existingLinkIds}
          onLinkIdChange={setLinkIdInput}
          onConfirm={handleStartLinking}
          onDismiss={() => setSelToolbar(null)}
        />
      )}
    </div>
  )
}

// ── Floating "Link to PDF" toolbar ────────────────────────────────────────────
function SelectionToolbar({
  viewportRect,
  linkId,
  existingIds,
  onLinkIdChange,
  onConfirm,
  onDismiss,
}: {
  viewportRect: DOMRect
  linkId: string
  existingIds: string[]
  onLinkIdChange: (v: string) => void
  onConfirm: () => void
  onDismiss: () => void
}) {
  const isDuplicate = existingIds.includes(linkId.trim())
  const top = Math.max(8, viewportRect.top - 96)
  const left = Math.max(8, viewportRect.left + viewportRect.width / 2 - 152)

  return (
    <div
      className="fixed z-50 flex flex-col gap-2.5 p-3 rounded-xl shadow-lg bg-card border border-border"
      style={{ top, left, width: 304 }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Link2 className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-semibold text-foreground">Link text to PDF region</span>
        </div>
        <button
          onClick={onDismiss}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div>
        <input
          type="text"
          value={linkId}
          onChange={e => onLinkIdChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !isDuplicate && linkId.trim()) onConfirm()
            if (e.key === 'Escape') onDismiss()
          }}
          placeholder="link-id"
          autoFocus
          className={cn(
            'w-full rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none border bg-background text-foreground',
            isDuplicate ? 'border-destructive' : 'border-input focus:border-primary'
          )}
        />
        {isDuplicate ? (
          <p className="text-xs mt-1 text-destructive">ID already used — choose another</p>
        ) : (
          <p className="text-xs mt-1 text-muted-foreground">Auto-generated from selection · edit if needed</p>
        )}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onDismiss}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={!linkId.trim() || isDuplicate}
          className="flex-1 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-40"
        >
          Link to PDF →
        </button>
      </div>
    </div>
  )
}
