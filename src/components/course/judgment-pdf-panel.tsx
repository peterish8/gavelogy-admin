'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { insertLink, deleteLink, updateLinkLabel, clearItemPdfUrl } from '@/actions/judgment/links'
import type { NotePdfLink } from '@/actions/judgment/links'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Upload, Loader2, FileText, Trash2, Trash, Link2, Unlink, ChevronDown, Sparkles, Copy,
  Search, X, ChevronUp,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { toast } from 'sonner'
import { findTextInPageData } from '@/lib/pdf-search'
import { JUDGMENT_SYSTEM_PROMPT } from '@/lib/prompts'
import { 
  LINK_COLORS, 
  DEFAULT_LINK_COLOR, 
  parseLinkMeta, 
  encodeLinkMeta,
  hexToRgb
} from '@/lib/pdf-utils'

const SCALE = 2.0

interface Region {
  page: number
  x: number
  y: number
  width: number
  height: number
}

export interface ConnectionViz {
  fromX: number
  fromY: number
  toX: number
  toY: number
  linkId: string
  color: string
  label?: string
}

interface ConnectPdfCapture {
  page: number
  x: number
  y: number
  width: number
  height: number
  text: string
}

interface JudgmentPdfPanelProps {
  itemId: string
  links: NotePdfLink[]
  onLinksChange: (updater: (prev: NotePdfLink[]) => NotePdfLink[]) => void
  connectMode: boolean
  connectStep: 'note' | 'pdf' | null
  connectPdfCapture: ConnectPdfCapture | null
  onConnectPdfCapture: (c: ConnectPdfCapture | null) => void
  highlightedLinkId: string | null
  onHighlightedLinkIdChange: (id: string | null) => void
  connectionViz: ConnectionViz | null
  onConnectionVizChange: (viz: ConnectionViz | null) => void
  getNoteLinkSpan: (linkId: string) => HTMLElement | null
  getNoteText: (linkId: string) => string
  onDeleteLink: (linkDbId: string) => Promise<void>
  onConnectSave: () => Promise<void>
  savingLink: boolean
  navigateToLinkId?: string | null
  onNavigateComplete?: () => void
  redrawTick?: number
  onAiNotesGenerated?: (formatted: string, provider: string) => void
  isPreview?: boolean
  onScrollNotes?: (linkId: string) => void
}

// PDF panel for the course editor: renders a lazy-loaded pdfjs PDF with drag-to-tag, link overlays, AI notes generation, and connection-line visualization.
export function JudgmentPdfPanel({
  itemId,
  links,
  onLinksChange,
  connectMode,
  connectStep,
  connectPdfCapture,
  onConnectPdfCapture,
  highlightedLinkId,
  onHighlightedLinkIdChange,
  connectionViz,
  onConnectionVizChange,
  getNoteLinkSpan,
  getNoteText,
  onDeleteLink,
  onConnectSave,
  savingLink,
  navigateToLinkId,
  onNavigateComplete,
  redrawTick,
  onAiNotesGenerated,
  isPreview = false,
  onScrollNotes,
}: JudgmentPdfPanelProps) {

  // ── PDF state ──────────────────────────────────────────────────────
  const [signedUrl, setSignedUrl] = useState<string | null>(null)
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
  const pdfScrollRef = useRef<HTMLDivElement>(null)

  const [aiSummarizing, setAiSummarizing] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(1.0)

  const [dragState, setDragState] = useState<{
    pageNum: number
    startX: number
    startY: number
    currentX: number
    currentY: number
    active: boolean
  } | null>(null)
  const [pendingRegion, setPendingRegion] = useState<Region | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [colorPickerOpenId, setColorPickerOpenId] = useState<string | null>(null)
  const [readingProgress, setReadingProgress] = useState(0)
  const [showConnections, setShowConnections] = useState(true)

  // ── Search state ───────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMatchCount, setSearchMatchCount] = useState(0)
  const [searchMatchIndex, setSearchMatchIndex] = useState(0)
  const searchMatchElsRef = useRef<HTMLElement[]>([])
  const searchQueryRef = useRef('')
  const searchInputRef = useRef<HTMLInputElement>(null)

  // ── Annotation overlays (PDF internal/external links) ─────────────
  const [pageAnnotations, setPageAnnotations] = useState<Record<number, Array<{
    left: number; top: number; width: number; height: number
    dest?: any; url?: string
  }>>>({})
  const pageAnnotationsRef = useRef<Record<number, boolean>>({})

  // ── Navigate-to-link trigger from parent (e.g. clicking linked text in editor) ──
  useEffect(() => {
    if (!navigateToLinkId) return
    const link = links.find(l => l.link_id === navigateToLinkId)
    if (link) {
      scrollToLink(link)
      // Draw connection after scroll animation completes (~700ms), then redraw again as safety net
      setTimeout(() => onConnectionVizChange(computeConnection(navigateToLinkId)), 750)
      setTimeout(() => onConnectionVizChange(computeConnection(navigateToLinkId)), 1200)
    }
    onNavigateComplete?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateToLinkId])

  // ── Recompute connection line when note panel scrolls (redrawTick from parent) ──
  useEffect(() => {
    if (!redrawTick || !connectionViz?.linkId) return
    requestAnimationFrame(() => onConnectionVizChange(computeConnection(connectionViz.linkId)))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [redrawTick])

  // ── Ctrl+Scroll Zoom Handler ──
  useEffect(() => {
    const el = pdfScrollRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const zoomDelta = -(e.deltaY * 0.002) // Smooth scaling based on wheel delta magnitude
        setZoomLevel(prev => Math.min(Math.max(0.5, prev + zoomDelta), 3.0))
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // ── Load PDF URL on mount ──────────────────────────────────────────
  useEffect(() => {
    async function loadPdfUrl() {
      setSignedUrl(`/api/judgment/pdf-proxy?itemId=${itemId}`)
    }
    loadPdfUrl()
  }, [itemId])

  // ── Connection viz computation ─────────────────────────────────────
  // Calculates the viewport coordinates of both the note span and the PDF region overlay so a line can be drawn between them.
  function computeConnection(linkId: string): ConnectionViz | null {
    const link = links.find(l => l.link_id === linkId)
    if (!link) return null
    const span = getNoteLinkSpan(linkId)
    if (!span) return null
    const pageEl = pageContainerRefs.current.get(link.pdf_page)
    if (!pageEl) return null
    const spanRect = span.getBoundingClientRect()
    const pageRect = pageEl.getBoundingClientRect()
    const canvasH = pageStates[link.pdf_page]?.height ?? 792 * SCALE
    const unzoomedCanvasH = canvasH / SCALE
    // Use rendered height (same formula as the overlay) so the arrow tip lands in the middle of the visible box
    const renderedH = Math.max(link.height * SCALE, 40) * zoomLevel
    const storedH   = link.height * SCALE * zoomLevel
    const topPad    = Math.max(0, renderedH - storedH) / 2
    const regionTop = pageRect.top + (unzoomedCanvasH - (link.y + link.height)) * SCALE * zoomLevel - topPad
    const toY = regionTop + renderedH / 2

    const fromY = spanRect.top + spanRect.height / 2

    // Hide if note span center is outside the note panel visible area
    const notePanel = span.closest('.judgment-note-editor') as HTMLElement | null
    if (notePanel) {
      const npRect = notePanel.getBoundingClientRect()
      if (fromY < npRect.top || fromY > npRect.bottom) return null
    }

    // Hide if PDF region center (toY) is outside the PDF scroll container visible area
    if (pdfScrollRef.current) {
      const pdfRect = pdfScrollRef.current.getBoundingClientRect()
      if (toY < pdfRect.top || toY > pdfRect.bottom) return null
    }

    const meta = parseLinkMeta(link.label)
    return {
      fromX: spanRect.right,
      fromY,
      toX: pageRect.left + link.x * SCALE * zoomLevel,
      toY,
      linkId,
      color: meta.color,
      label: meta.text || undefined,
    }
  }

  // Smoothly scrolls the PDF container so the given link's PDF region is near the top of the viewport.
  function scrollToLink(link: NotePdfLink) {
    const pdfContainer = pdfScrollRef.current
    const pageEl = pageContainerRefs.current.get(link.pdf_page)
    if (!pageEl || !pdfContainer) return
    const canvasH = pageStates[link.pdf_page]?.height ?? 792 * SCALE
    const unzoomedCanvasH = canvasH / SCALE
    const regionTopOnPage = (unzoomedCanvasH - (link.y + link.height)) * SCALE * zoomLevel
    const containerRect = pdfContainer.getBoundingClientRect()
    const pageRect = pageEl.getBoundingClientRect()
    const pageTopInContainer = pageRect.top - containerRect.top + pdfContainer.scrollTop
    const target = Math.max(0, pageTopInContainer + regionTopOnPage - 100)
    pdfContainer.scrollTo({ top: target, behavior: 'smooth' })
  }

  // Triggers a rAF-deferred recomputation of the active connection line coordinates.
  function redrawConnection(activeId?: string | null) {
    const id = activeId ?? highlightedLinkId ?? connectionViz?.linkId
    if (!id) return
    requestAnimationFrame(() => onConnectionVizChange(computeConnection(id)))
  }

  // Renders a PDF page onto its canvas and builds a pdfjs TextLayer for text selection; skips already-rendered pages.
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDocRef.current || renderedPages.current.has(pageNum)) return
    renderedPages.current.add(pageNum)
    try {
      const page = await pdfDocRef.current.getPage(pageNum)
      const viewport = page.getViewport({ scale: SCALE })
      const canvas = canvasRefs.current.get(pageNum)
      if (!canvas) return

      // HiDPI / retina quality fix — render at device pixel ratio
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.floor(viewport.width * dpr)
      canvas.height = Math.floor(viewport.height * dpr)
      canvas.style.width = `${viewport.width}px`
      canvas.style.height = `${viewport.height}px`
      const ctx = canvas.getContext('2d')!
      ctx.scale(dpr, dpr)
      await page.render({ canvasContext: ctx, viewport }).promise

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

      // Extract PDF annotations (internal/external links) once per page
      if (!pageAnnotationsRef.current[pageNum]) {
        pageAnnotationsRef.current[pageNum] = true
        try {
          const annotations = await page.getAnnotations()
          const linkAnns = annotations
            .filter((a: any) => a.subtype === 'Link' && (a.dest || a.url || a.action?.URI))
            .map((a: any) => {
              const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle(a.rect)
              return {
                left: Math.min(vx1, vx2),
                top: Math.min(vy1, vy2),
                width: Math.abs(vx2 - vx1),
                height: Math.abs(vy2 - vy1),
                dest: a.dest ?? null,
                url: a.url ?? a.action?.URI ?? null,
              }
            })
          if (linkAnns.length > 0) {
            setPageAnnotations(prev => ({ ...prev, [pageNum]: linkAnns }))
          }
        } catch {
          // annotations are non-critical — ignore errors
        }
      }

      setPageStates(prev => ({
        ...prev,
        [pageNum]: { rendered: true, width: viewport.width, height: viewport.height },
      }))
    } catch (err) {
      console.error(`Page ${pageNum} render error:`, err)
    }
  }, [])

  // ── PDF search helpers ────────────────────────────────────────────
  function clearSearchHighlights() {
    for (let p = 1; p <= numPages; p++) {
      const c = textLayerContainerRefs.current.get(p)
      if (!c) continue
      c.querySelectorAll('mark.pdf-search-hl').forEach(mark => {
        const parent = mark.parentNode
        if (!parent) return
        parent.replaceChild(document.createTextNode(mark.textContent || ''), mark)
        parent.normalize()
      })
    }
  }

  function highlightInContainer(container: HTMLElement, query: string): HTMLElement[] {
    const marks: HTMLElement[] = []
    const regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')
    const walkNode = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent || ''
        const ranges: Array<{ s: number; e: number; m: string }> = []
        let match
        regex.lastIndex = 0
        while ((match = regex.exec(text)) !== null) {
          ranges.push({ s: match.index, e: match.index + match[0].length, m: match[0] })
        }
        if (ranges.length === 0) return
        const parent = node.parentNode!
        const frag = document.createDocumentFragment()
        let offset = 0
        for (const { s, e, m } of ranges) {
          if (offset < s) frag.appendChild(document.createTextNode(text.slice(offset, s)))
          const mark = document.createElement('mark')
          mark.className = 'pdf-search-hl'
          mark.textContent = m
          frag.appendChild(mark)
          marks.push(mark)
          offset = e
        }
        if (offset < text.length) frag.appendChild(document.createTextNode(text.slice(offset)))
        parent.replaceChild(frag, node)
      } else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName !== 'MARK') {
        Array.from(node.childNodes).forEach(walkNode)
      }
    }
    Array.from(container.childNodes).forEach(walkNode)
    return marks
  }

  const runSearch = useCallback((query: string) => {
    clearSearchHighlights()
    searchMatchElsRef.current = []
    setSearchMatchCount(0)
    setSearchMatchIndex(0)
    searchQueryRef.current = query
    if (!query.trim()) return
    const allMarks: HTMLElement[] = []
    for (let p = 1; p <= numPages; p++) {
      const c = textLayerContainerRefs.current.get(p)
      if (!c) continue
      allMarks.push(...highlightInContainer(c, query))
    }
    searchMatchElsRef.current = allMarks
    setSearchMatchCount(allMarks.length)
    if (allMarks.length > 0) {
      allMarks[0].classList.add('pdf-search-hl-active')
      allMarks[0].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numPages])

  const navigateMatch = useCallback((direction: 1 | -1) => {
    const els = searchMatchElsRef.current
    if (els.length === 0) return
    setSearchMatchIndex(prev => {
      const next = (prev + direction + els.length) % els.length
      els[prev]?.classList.remove('pdf-search-hl-active')
      els[next]?.classList.add('pdf-search-hl-active')
      els[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return next
    })
  }, [])

  // Clear highlights when search closes
  useEffect(() => {
    if (!searchOpen) {
      clearSearchHighlights()
      searchMatchElsRef.current = []
      setSearchMatchCount(0)
      setSearchMatchIndex(0)
      setSearchQuery('')
      searchQueryRef.current = ''
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchOpen])

  // Ctrl+F shortcut to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f' && signedUrl) {
        e.preventDefault()
        setSearchOpen(true)
        setTimeout(() => searchInputRef.current?.focus(), 50)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [signedUrl])

  // ── PDF annotation navigation ────────────────────────────────────
  async function navigateToDest(dest: any) {
    if (!pdfDocRef.current) return
    try {
      let destArray = dest
      if (typeof dest === 'string') {
        destArray = await pdfDocRef.current.getDestination(dest)
      }
      if (!Array.isArray(destArray) || destArray.length === 0) return
      const pageIndex = await pdfDocRef.current.getPageIndex(destArray[0])
      const targetPage = pageIndex + 1
      const pageEl = pageContainerRefs.current.get(targetPage)
      if (pageEl && pdfScrollRef.current) {
        const offsetTop = (pageEl as HTMLElement).offsetTop - 80
        pdfScrollRef.current.scrollTo({ top: Math.max(0, offsetTop), behavior: 'smooth' })
      }
    } catch (e) {
      console.warn('PDF dest navigation error:', e)
    }
  }

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

  // Uploads a PDF file to the judgment upload API and updates the proxy URL to trigger a re-render of the PDF.
  async function handlePdfUpload(file: File) {
    setUploadingPdf(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('caseId', itemId)
      const res = await fetch('/api/judgment/upload', {
        method: 'POST',
        body: formData,
      })
      const result = await res.json()
      if (!result.success) throw new Error(result.error || 'Upload failed')
      setSignedUrl(`/api/judgment/pdf-proxy?itemId=${itemId}&t=${Date.now()}`)
      toast.success('PDF uploaded')
    } catch (err: any) {
      toast.error(err.message || 'Upload failed')
    } finally {
      setUploadingPdf(false)
    }
  }

  // Clears the PDF object key from DB and resets all local PDF state; existing link coordinates are preserved.
  async function handleDeletePdf() {
    if (!confirm('Remove this PDF? Tag coordinates are kept.')) return
    setDeletingPdf(true)
    try {
      await clearItemPdfUrl(itemId)
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

  // Starts a drag selection in normal (non-connect) mode, recording start coords adjusted for zoom level.
  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>, pageNum: number) {
    if (connectMode) return
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    setDragState({
      pageNum,
      startX: (e.clientX - rect.left) / zoomLevel,
      startY: (e.clientY - rect.top) / zoomLevel,
      currentX: (e.clientX - rect.left) / zoomLevel,
      currentY: (e.clientY - rect.top) / zoomLevel,
      active: true,
    })
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragState?.active) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDragState(prev =>
      prev ? { ...prev, currentX: (e.clientX - rect.left) / zoomLevel, currentY: (e.clientY - rect.top) / zoomLevel } : null
    )
  }

  function handleMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragState?.active) return
    const rect = e.currentTarget.getBoundingClientRect()
    const endX = (e.clientX - rect.left) / zoomLevel
    const endY = (e.clientY - rect.top) / zoomLevel
    const mouseX = Math.min(dragState.startX, endX)
    const mouseY = Math.min(dragState.startY, endY)
    const mouseW = Math.abs(endX - dragState.startX)
    const mouseH = Math.abs(endY - dragState.startY)
    if (mouseW > 8 / zoomLevel && mouseH > 8 / zoomLevel) {
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

  // ── Connect mode: PDF text selection ──────────────────────────────
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
    onConnectPdfCapture({
      page: pageNum,
      x: (rect.left - pageRect.left) / (SCALE * zoomLevel),
      y: (canvasH / SCALE) - ((rect.top - pageRect.top) / (SCALE * zoomLevel)) - (rect.height / (SCALE * zoomLevel)),
      width: Math.max(rect.width / (SCALE * zoomLevel), 10),
      height: Math.max(rect.height / (SCALE * zoomLevel), 8),
      text: sel.toString().trim(),
    })
  }

  // ── Region selected (normal drag mode) ────────────────────────────
  async function handleRegionSelected(region: Region) {
    setPendingRegion(region)
  }

  async function handleModalSave(linkId: string, label: string, color: string) {
    if (!pendingRegion) return
    try {
      const newLink = await insertLink({
        item_id: itemId,
        link_id: linkId,
        pdf_page: pendingRegion.page,
        x: pendingRegion.x,
        y: pendingRegion.y,
        width: pendingRegion.width,
        height: pendingRegion.height,
        label: encodeLinkMeta(label, color),
      })
      onLinksChange(prev => [...prev, newLink])
      setPendingRegion(null)
      toast.success(`Tagged "${linkId}" on page ${pendingRegion.page}`)
    } catch (err: any) {
      toast.error(err.message || 'Failed to save tag')
    }
  }

  // ── Delete handler ─────────────────────────────────────────────────
  async function handleDelete(linkDbId: string) {
    setDeletingId(linkDbId)
    try {
      const linkToDelete = links.find(l => l.id === linkDbId)
      await onDeleteLink(linkDbId)
      if (highlightedLinkId === linkToDelete?.link_id) {
        onHighlightedLinkIdChange(null)
        onConnectionVizChange(null)
      }
    } finally {
      setDeletingId(null)
    }
  }

  // ── AI helpers ────────────────────────────────────────────────────


  /** Extract plain text from all PDF pages. */
  async function extractPdfText(): Promise<string> {
    if (!pdfDocRef.current) return ''
    const parts: string[] = []
    const total = pdfDocRef.current.numPages
    for (let i = 1; i <= total; i++) {
        const page = await pdfDocRef.current.getPage(i)
        const content = await page.getTextContent()
        const pageText = (content.items as any[]).map((item: any) => item.str).join(' ')
        parts.push(`[Page ${i}]\n${pageText}`)
    }
    return parts.join('\n\n')
  }

  /** Copy text to clipboard with a toast. */
  async function copyToClipboard(text: string, description: string) {
    try {
        await navigator.clipboard.writeText(text)
        toast.success(`${description} copied to clipboard`)
    } catch (err: any) {
        toast.error('Failed to copy: ' + err.message)
    }
  }

  /** Copies the base system instructions. */
  function handleCopySystemPrompt() {
    copyToClipboard(JUDGMENT_SYSTEM_PROMPT, 'System prompt')
  }

  /** Extracts PDF text and copies the combined instructions + judgment prompt. */
  async function handleCopyFullPrompt() {
    const toastId = toast.loading('📄 Extracting text for prompt…')
    try {
        const pdfText = await extractPdfText()
        if (!pdfText) throw new Error('No text found in PDF')
        
        const fullPrompt = `${JUDGMENT_SYSTEM_PROMPT}\n\nGenerate a complete GAVELOGY case law note from the following judgment text:\n\n${pdfText}`
        await copyToClipboard(fullPrompt, 'Full prompt')
    } catch (err: any) {
        toast.error(err.message || 'Prompt generation failed')
    } finally {
        toast.dismiss(toastId)
    }
  }

  /** Programmatic fallback connections.
   *
   *  Strategy: Indian SC judgments follow a very predictable structure.
   *  We estimate which page each section came from using position fractions,
   *  then anchor to the first distinctive words on that page.
   *  Because we constrain search to that exact page, the match is guaranteed.
   *  Connections are semantically correct at the page level even if not the exact line.
   */
  function extractProgrammaticConnections(
    formatted: string,
    pageData: { pageNum: number; items: any[] }[],
  ): Array<{ linkId: string; noteAnchor: string; pdfSearchText: string; pdfPage: number; label: string; color: string }> {
    const total = pageData.length
    if (total === 0) return []

    // Matches the new JUDGMENT_SYSTEM_PROMPT emoji-heading format e.g. [h2]🧾 Facts[/h2].
    // `check` is a unique substring to detect if the section was generated.
    // `noteAnchor` is the plain text (no emoji) used for link injection via the heading regex.
    const sections: {
      linkId: string; check: string; noteAnchor: string; label: string; color: string; fraction: number
    }[] = [
      { linkId: 'link-prog-facts',    check: 'Facts',                      noteAnchor: 'Facts',                      label: 'Facts',     color: '#c9922a', fraction: 0.12 },
      { linkId: 'link-prog-issues',   check: 'Legal Issues',               noteAnchor: 'Legal Issues',               label: 'Issues',    color: '#dc2626', fraction: 0.28 },
      { linkId: 'link-prog-holdings', check: 'Holdings / Ratio Decidendi', noteAnchor: 'Holdings / Ratio Decidendi', label: 'Ratio',     color: '#2563eb', fraction: 0.75 },
      { linkId: 'link-prog-analysis', check: "Court's Analysis",           noteAnchor: "Court's Analysis",           label: 'Reasoning', color: '#7c3aed', fraction: 0.62 },
      { linkId: 'link-prog-doctrine', check: 'Doctrines / Principles',     noteAnchor: 'Doctrines / Principles',     label: 'Doctrine',  color: '#16a34a', fraction: 0.35 },
    ]

    const results: { linkId: string; noteAnchor: string; pdfSearchText: string; pdfPage: number; label: string; color: string }[] = []
    const usedPages = new Set<number>()

    for (const sec of sections) {
      // Only create connection if this section heading appears in the notes
      if (!formatted.includes(sec.check)) continue

      // Estimate which page this section's content came from
      let targetPage = Math.max(1, Math.min(total, Math.round(total * sec.fraction)))
      // Avoid two connections pointing to the exact same page
      while (usedPages.has(targetPage) && targetPage < total) targetPage++
      usedPages.add(targetPage)

      const pageItems = pageData.find(p => p.pageNum === targetPage)?.items ?? []
      if (pageItems.length === 0) continue

      // Pick first 6 words from this page that are longer than 4 chars (avoids short filler words)
      // These words are GUARANTEED to be on this page → search on this page will always succeed
      const pageWords = pageItems
        .map((it: any) => (it.str ?? '').trim())
        .join(' ')
        .split(/\s+/)
        .filter((w: string) => w.length > 4 && /[a-zA-Z]/.test(w))
        .slice(0, 6)

      if (pageWords.length < 3) continue

      results.push({
        linkId: sec.linkId,
        noteAnchor: sec.noteAnchor,
        pdfSearchText: pageWords.join(' '),
        pdfPage: targetPage,
        label: sec.label,
        color: sec.color,
      })
    }

    return results
  }

  // ── AI: Extract text from all PDF pages and generate case notes ───
  async function handleAiSummarize() {
    if (!pdfDocRef.current) {
      toast.error('No PDF loaded — upload a judgment PDF first')
      return
    }
    if (!onAiNotesGenerated) return
    setAiSummarizing(true)
    const toastId = toast.loading('📄 Extracting text from PDF…')
    try {
      // Extract text from every page — keep items with positions for auto-linking
      const pageData: { pageNum: number; items: any[] }[] = []
      const parts: string[] = []
      const total: number = pdfDocRef.current.numPages
      for (let i = 1; i <= total; i++) {
        const page = await pdfDocRef.current.getPage(i)
        const content = await page.getTextContent()
        const items = content.items as any[]
        pageData.push({ pageNum: i, items })
        const pageText = items.map((item: any) => item.str).join(' ')
        parts.push(`[Page ${i}]\n${pageText}`)
      }
      const pdfText = parts.join('\n\n')

      toast.loading('✨ AI is generating case notes…', { id: toastId })

      const res = await fetch('/api/ai-summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfText }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'AI failed')

      const rawFormatted: string = data.formatted ?? ''

      // ── Build connection list: AI JSON (if present) + programmatic extraction ──
      const aiConnections: any[] = Array.isArray(data.connections) ? data.connections : []
      const progConnections = extractProgrammaticConnections(rawFormatted, pageData)

      // Merge: AI connections take priority (they have page numbers); programmatic fills gaps
      const seen = new Set(aiConnections.map((c: any) => c.linkId))
      const mergedConnections = [
        ...aiConnections,
        ...progConnections.filter(c => !seen.has(c.linkId)),
      ]

      toast.loading('🔗 Creating connections…', { id: toastId })

      // Delete all previous links for this item
      for (const existing of links) {
        try { await deleteLink(existing.id) } catch {}
      }
      onLinksChange(() => [])

      let formattedWithLinks = rawFormatted
      const createdLinks: import('@/actions/judgment/links').NotePdfLink[] = []

      for (const conn of mergedConnections) {
        try {
          // Use pdfPage hint (from AI) to constrain search — avoids wrong-page matches
          const pdfPage: number | undefined = typeof conn.pdfPage === 'number' ? conn.pdfPage : undefined
          const searchText: string = conn.pdfSearchText ?? conn.searchText ?? ''
          const endText: string | undefined = conn.pdfSearchTextEnd ?? undefined
          const pos = findTextInPageData(pageData, searchText, pdfPage, endText)
          if (!pos) {
            console.debug('[ai-connect] not found in PDF:', conn.linkId, searchText)
            continue
          }

          const label = encodeLinkMeta(conn.label ?? '', conn.color ?? DEFAULT_LINK_COLOR)
          const newLink = await insertLink({
            item_id: itemId,
            link_id: conn.linkId,
            pdf_page: pos.page,
            x: pos.x,
            y: pos.y,
            width: pos.width,
            height: pos.height,
            label,
          })
          createdLinks.push(newLink)

          // Inject [link:X]...[/link] into the SECTION HEADING in the notes.
          // noteAnchor = exact [h2] heading text (e.g. "A4 | ISSUES BEFORE THE COURT")
          // This gives a clean, semantic anchor — the heading title is the linked element.
          const anchor: string = conn.noteAnchor ?? conn.noteText ?? ''
          if (anchor && !formattedWithLinks.includes(`[link:${conn.linkId}]`)) {
            const escaped = anchor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            // Allow emoji/chars before the anchor inside heading — e.g. [h2]🧾 Facts[/h2]
            const headingRe = new RegExp(`(\\[h[123]\\][^\\[]*?)(${escaped})(\\[/h[123]\\])`, 'i')
            if (headingRe.test(formattedWithLinks)) {
              formattedWithLinks = formattedWithLinks.replace(
                headingRe,
                `$1[link:${conn.linkId}]$2[/link]$3`,
              )
            } else {
              formattedWithLinks = formattedWithLinks.replace(
                new RegExp(escaped, 'i'),
                `[link:${conn.linkId}]${anchor}[/link]`,
              )
            }
          }
        } catch (err) {
          console.warn('[ai-connect] Failed:', conn.linkId, err)
        }
      }

      if (createdLinks.length > 0) {
        onLinksChange(() => createdLinks)
        toast.success(`✨ Notes + ${createdLinks.length} connections created!${data.provider ? ` (via ${data.provider})` : ''}`, { id: toastId })
      } else {
        toast.success(`✨ Case notes generated!${data.provider ? ` (via ${data.provider})` : ''}`, { id: toastId })
      }

      onAiNotesGenerated(formattedWithLinks, data.provider || '')
    } catch (e: any) {
      toast.error(e.message || 'AI summarization failed', { id: toastId })
    } finally {
      setAiSummarizing(false)
    }
  }

  const inPdfSelectStep = connectMode && connectStep === 'pdf'
  const existingLinkIds = links.map(l => l.link_id)

  const selRect = dragState?.active ? {
    x: Math.min(dragState.startX, dragState.currentX),
    y: Math.min(dragState.startY, dragState.currentY),
    w: Math.abs(dragState.currentX - dragState.startX),
    h: Math.abs(dragState.currentY - dragState.startY),
  } : null

  // Per-link flash keyframes using each link's color
  const flashStyles = links.map(link => {
    const { color } = parseLinkMeta(link.label)
    const rgb = hexToRgb(color)
    const id = link.link_id.replace(/[^a-zA-Z0-9]/g, '_')
    return `
@keyframes lf_${id} {
  0%   { background: rgba(${rgb},0.15); box-shadow: 0 0 0 2px rgba(${rgb},0.45); }
  40%  { background: rgba(${rgb},0.40); box-shadow: 0 0 0 4px rgba(${rgb},0.65); }
  100% { background: rgba(${rgb},0.15); box-shadow: 0 0 0 2px rgba(${rgb},0.45); }
}
.lf_${id} { animation: lf_${id} 0.7s ease-in-out 3; }`
  }).join('\n')

  return (
    <div className="flex flex-col h-full min-w-0 overflow-hidden">
      <style>{flashStyles}</style>

      {/* Header */}
      <div className="relative flex items-center justify-between px-4 py-2.5 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground">Judgment PDF</span>
          {links.length > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              {links.length} linked
            </span>
          )}
        </div>
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
          {/* ✨ AI Notes button — only visible when PDF is loaded */}
          {signedUrl && onAiNotesGenerated && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={aiSummarizing || pdfLoading}
                  className="flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-semibold transition-all bg-linear-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  {aiSummarizing
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Sparkles className="w-3 h-3" />
                  }
                  {aiSummarizing ? 'Generating…' : 'AI Notes'}
                  <ChevronDown className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem 
                  onClick={handleAiSummarize}
                  disabled={aiSummarizing}
                  className="gap-2"
                >
                  <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                  <span>Generate AI Notes</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={handleCopySystemPrompt}
                  className="gap-2"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy System Prompt</span>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={handleCopyFullPrompt}
                  className="gap-2"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Copy Full Prompt (+PDF)</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {/* Search bar */}
          {signedUrl && (
            <div className="flex items-center gap-1">
              {searchOpen && (
                <div className="flex items-center gap-1 bg-muted/80 rounded-md border border-border px-2 h-7">
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); runSearch(e.target.value) }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') navigateMatch(e.shiftKey ? -1 : 1)
                      if (e.key === 'Escape') setSearchOpen(false)
                    }}
                    placeholder="Search in PDF…"
                    className="w-36 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
                    autoFocus
                  />
                  {searchQuery.trim() && (
                    <span className={cn('text-[10px] font-mono whitespace-nowrap', searchMatchCount === 0 ? 'text-destructive' : 'text-muted-foreground')}>
                      {searchMatchCount === 0 ? 'No results' : `${searchMatchIndex + 1}/${searchMatchCount}`}
                    </span>
                  )}
                  <button onClick={() => navigateMatch(-1)} disabled={searchMatchCount === 0} className="hover:bg-background rounded p-0.5 disabled:opacity-30" title="Previous (Shift+Enter)">
                    <ChevronUp className="w-3 h-3" />
                  </button>
                  <button onClick={() => navigateMatch(1)} disabled={searchMatchCount === 0} className="hover:bg-background rounded p-0.5 disabled:opacity-30" title="Next (Enter)">
                    <ChevronDown className="w-3 h-3" />
                  </button>
                  <button onClick={() => setSearchOpen(false)} className="hover:bg-background rounded p-0.5 text-muted-foreground hover:text-foreground" title="Close search">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setSearchOpen(v => !v); if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 50) }}
                className={cn('h-7 w-7 p-0', searchOpen && 'bg-muted')}
                title="Search in PDF (Ctrl+F)"
              >
                <Search className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {signedUrl && (
            <div className="flex items-center gap-px bg-muted/60 p-0.5 rounded-md border border-border">
              <button onClick={() => setZoomLevel(p => Math.max(0.5, p - 0.1))} className="w-6 h-6 flex items-center justify-center text-xs hover:bg-background rounded-sm text-muted-foreground hover:text-foreground" title="Zoom Out">-</button>
              <button onClick={() => setZoomLevel(1.0)} className="px-2 h-6 flex items-center justify-center text-[10px] hover:bg-background rounded-sm font-mono text-muted-foreground hover:text-foreground" title="Reset Zoom">{Math.round(zoomLevel * 100)}%</button>
              <button onClick={() => setZoomLevel(p => Math.min(3.0, p + 0.1))} className="w-6 h-6 flex items-center justify-center text-xs hover:bg-background rounded-sm text-muted-foreground hover:text-foreground" title="Zoom In">+</button>
            </div>
          )}
          {signedUrl && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDeletePdf}
              disabled={deletingPdf}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
              title="Remove PDF"
            >
              {deletingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash className="w-3.5 h-3.5" />}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPdf || deletingPdf}
            className="h-7 text-xs"
          >
            {uploadingPdf ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
            {uploadingPdf ? 'Uploading…' : signedUrl ? 'Replace' : 'Upload PDF'}
          </Button>
        </div>
      </div>

      {/* Connect mode step 2 banner */}
      {inPdfSelectStep && (
        <div className={cn(
          'px-4 py-2 border-b shrink-0 flex items-center justify-between gap-2',
          connectPdfCapture
            ? 'bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800/30'
            : 'bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800/30'
        )}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn(
              'text-xs font-semibold px-1.5 py-0.5 rounded shrink-0',
              connectPdfCapture
                ? 'bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200'
                : 'bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200'
            )}>2</span>
            <span className={cn('text-xs truncate', connectPdfCapture
              ? 'text-green-800 dark:text-green-300'
              : 'text-blue-800 dark:text-blue-300'
            )}>
              {connectPdfCapture
                ? `PDF text: "${connectPdfCapture.text.slice(0, 35)}${connectPdfCapture.text.length > 35 ? '…' : ''}"`
                : 'Select matching text in the judgment PDF below'
              }
            </span>
          </div>
          {connectPdfCapture && (
            <div className="flex gap-1.5 shrink-0">
              <Button
                size="sm"
                className="h-6 text-xs bg-green-600 hover:bg-green-700 text-white border-0 px-2"
                onClick={onConnectSave}
                disabled={savingLink}
              >
                {savingLink ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Connect!'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs px-2"
                onClick={() => onConnectPdfCapture(null)}
              >
                Re-select
              </Button>
            </div>
          )}
        </div>
      )}

      {/* PDF body */}
      <div
        ref={pdfScrollRef}
        className="flex-1 overflow-y-auto bg-muted/30"
        onScroll={e => {
          const el = e.currentTarget
          const pct = (el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100
          setReadingProgress(Math.min(100, pct || 0))
          requestAnimationFrame(() => redrawConnection())
        }}
      >
        {!signedUrl ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center p-6">
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
          <div className="flex items-center justify-center h-full p-6">
            <p className="text-sm text-destructive text-center">Failed to load: {pdfError}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6 py-6 px-4" style={{ zoom: zoomLevel }}>
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
                        const sh = Math.max(link.height * SCALE, 40)
                        // sy: top of box in canvas px (PDF y origin is bottom-left)
                        // Centre the padded height on the stored region
                        const sy = canvasH - (link.y + link.height) * SCALE - Math.max(0, sh - link.height * SCALE) / 2
                        const isHighlighted = highlightedLinkId === link.link_id
                        const isConnected = connectionViz?.linkId === link.link_id
                        const { text: linkLabel, color: linkColor } = parseLinkMeta(link.label)

                        return (
                          <div
                            key={link.id}
                            title={`${link.link_id}${linkLabel ? ` — ${linkLabel}` : ''}`}
                            className={cn('absolute group', isHighlighted && `lf_${link.link_id.replace(/[^a-zA-Z0-9]/g, '_')}`)}
                            style={{
                              left: 0, right: 0, top: sy, height: sh,
                              background: isHighlighted
                                ? `${linkColor}30`
                                : isConnected
                                ? `${linkColor}22`
                                : `${linkColor}12`,
                              borderLeft: `4px solid ${linkColor}`,
                              borderTop: 'none',
                              borderRight: 'none',
                              borderBottom: 'none',
                              borderRadius: 0,
                              zIndex: isConnected ? 7 : 5,
                              pointerEvents: inPdfSelectStep ? 'none' : 'all',
                              transition: 'background 0.15s',
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
                                  {linkLabel && <span className="text-muted-foreground"> — {linkLabel}</span>}
                                </div>
                              </>
                            )}
                          </div>
                        )
                      })}

                      {/* PDF internal/external link annotations */}
                      {ps?.rendered && (pageAnnotations[pageNum] || []).map((ann, i) => (
                        <div
                          key={`ann-${i}`}
                          className="absolute"
                          style={{
                            left: ann.left, top: ann.top,
                            width: Math.max(ann.width, 8), height: Math.max(ann.height, 8),
                            zIndex: 6,
                            cursor: 'pointer',
                          }}
                          onClick={() => {
                            if (ann.url) window.open(ann.url, '_blank', 'noopener,noreferrer')
                            else if (ann.dest) navigateToDest(ann.dest)
                          }}
                          title={ann.url ? ann.url : 'Jump to linked page'}
                        />
                      ))}

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

                      {/* Live selection rectangle */}
                      {dragState?.active && dragState.pageNum === pageNum && selRect && (
                        <div
                          className="absolute pointer-events-none"
                          style={{
                            left: selRect.x, top: selRect.y,
                            width: selRect.w, height: selRect.h,
                            border: '2px dashed #3b82f6',
                            background: 'rgba(59,130,246,0.08)',
                            zIndex: 20,
                          }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
        )}
      </div>

      {/* Connections panel — hidden in preview mode (admin-only UI) */}
      <div className={cn("shrink-0 border-t border-border bg-card", isPreview && "hidden")}>
        <button
          onClick={() => setShowConnections(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Link2 className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-semibold text-foreground">Connections</span>
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

        {showConnections && (
          <div className="max-h-48 overflow-y-auto border-t border-border divide-y divide-border/50">
            {links.length === 0 ? (
              <div className="px-4 py-5 text-center">
                <Unlink className="w-5 h-5 mx-auto mb-1.5 text-muted-foreground/40" />
                <p className="text-xs text-muted-foreground">No connections yet</p>
              </div>
            ) : (
              links.map(link => {
                const noteText = getNoteText(link.link_id)
                const isActive = connectionViz?.linkId === link.link_id || highlightedLinkId === link.link_id
                const { text: linkLabel, color: linkColor } = parseLinkMeta(link.label)
                const isColorOpen = colorPickerOpenId === link.id
                return (
                  <div key={link.id} className="relative">
                    <div
                      onClick={() => {
                        setColorPickerOpenId(null)
                        scrollToLink(link)
                        onScrollNotes?.(link.link_id)
                        onHighlightedLinkIdChange(link.link_id)
                        setTimeout(() => onConnectionVizChange(computeConnection(link.link_id)), 700)
                        setTimeout(() => onHighlightedLinkIdChange(null), 5000)
                      }}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 cursor-pointer group transition-colors',
                        isActive ? 'bg-muted/60' : 'hover:bg-muted/50'
                      )}
                    >
                      {/* Color dot — click to open color picker */}
                      <button
                        onClick={e => { e.stopPropagation(); setColorPickerOpenId(isColorOpen ? null : link.id) }}
                        title="Change color"
                        className="w-3 h-3 rounded-full shrink-0 ring-1 ring-white/40 hover:scale-125 transition-transform"
                        style={{ background: linkColor }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-xs font-medium truncate" style={{ color: linkColor }}>
                            "{noteText}"
                          </span>
                          <span className="text-muted-foreground/40 text-xs shrink-0">→</span>
                          <span className="text-xs text-muted-foreground shrink-0">p.{link.pdf_page}</span>
                        </div>
                        {linkLabel && (
                          <div className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{linkLabel}</div>
                        )}
                      </div>
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
                    {/* Inline color picker */}
                    {isColorOpen && (
                      <div
                        className="flex items-center gap-2 px-4 py-2 bg-muted/80 border-t border-border/50"
                        onClick={e => e.stopPropagation()}
                      >
                        <span className="text-[10px] text-muted-foreground mr-1">Color:</span>
                        {LINK_COLORS.map(c => (
                          <button
                            key={c.hex}
                            title={c.name}
                            onClick={async () => {
                              const newLabel = encodeLinkMeta(linkLabel, c.hex)
                              // Optimistic update
                              onLinksChange(prev => prev.map(l => l.id === link.id ? { ...l, label: newLabel } : l))
                              setColorPickerOpenId(null)
                              try { await updateLinkLabel(link.id, newLabel) }
                              catch { toast.error('Failed to update color') }
                            }}
                            className={cn(
                              'w-5 h-5 rounded-full transition-all border-2',
                              linkColor === c.hex ? 'scale-125 border-white shadow' : 'border-transparent opacity-70 hover:opacity-100'
                            )}
                            style={{ background: c.hex }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* TagModal */}
      {pendingRegion && (
        <SimpleTagModal
          region={pendingRegion}
          existingLinkIds={existingLinkIds}
          onSave={handleModalSave}
          onClose={() => setPendingRegion(null)}
        />
      )}
    </div>
  )
}

// ── Inline simple tag modal (avoids import from app dir) ────────────
function SimpleTagModal({
  region,
  existingLinkIds,
  onSave,
  onClose,
}: {
  region: Region
  existingLinkIds: string[]
  onSave: (linkId: string, label: string, color: string) => Promise<void>
  onClose: () => void
}) {
  const [linkId, setLinkId] = useState('')
  const [label, setLabel] = useState('')
  const [color, setColor] = useState(DEFAULT_LINK_COLOR)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave() {
    const trimmed = linkId.trim()
    if (!trimmed) { setError('Link ID is required'); return }
    if (existingLinkIds.includes(trimmed)) { setError('This link ID already exists'); return }
    setSaving(true)
    try {
      await onSave(trimmed, label.trim(), color)
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-80 max-w-[90vw]" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-sm mb-1">Tag PDF Region</h3>
        <p className="text-xs text-muted-foreground mb-4">Page {region.page}</p>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium block mb-1">Link ID</label>
            <input
              autoFocus
              value={linkId}
              onChange={e => { setLinkId(e.target.value); setError('') }}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose() }}
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="e.g. damages-para-12"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-1">Label (optional)</label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Short description"
            />
          </div>
          <div>
            <label className="text-xs font-medium block mb-2">Color</label>
            <div className="flex gap-2">
              {LINK_COLORS.map(c => (
                <button
                  key={c.hex}
                  title={c.name}
                  onClick={() => setColor(c.hex)}
                  className={cn(
                    'w-8 h-8 rounded-full transition-all border-2',
                    color === c.hex ? 'scale-110 border-white shadow-md' : 'border-transparent opacity-60 hover:opacity-100'
                  )}
                  style={{ background: c.hex }}
                />
              ))}
            </div>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleSave} disabled={saving} className="flex-1 text-white" style={{ background: color }}>
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Save Tag
            </Button>
            <Button size="sm" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
