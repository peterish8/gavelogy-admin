'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { insertLink, deleteLink, updateLinkLabel, updateLinkRegion, clearItemPdfUrl, fetchLinksForItem } from '@/actions/judgment/links'
import type { NotePdfLink } from '@/actions/judgment/links'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Upload, Loader2, FileText, Trash2, Trash, Link2, Unlink, ChevronDown, Sparkles, Copy,
  Search, X, ChevronUp, Moon, RefreshCw, Square,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { toast } from 'sonner'
import { findTextInPageData } from '@/lib/pdf-search'
import { 
  LINK_COLORS, 
  DEFAULT_LINK_COLOR, 
  parseLinkMeta,
  encodeLinkMeta,
  hexToRgb
} from '@/lib/pdf-utils'

// Adaptive PDF rendering scale based on device pixel ratio and quality setting
const getScale = (quality: 'low' | 'medium' | 'high' = 'high') => {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  const baseScale = quality === 'low' ? 1.0 : quality === 'medium' ? 1.5 : 2.0
  return Math.min(baseScale * dpr, 3.0) // Cap at 3.0 to prevent excessive memory usage
}

const CONNECTION_HIGHLIGHT_MS = 3000

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

interface LinkRegion {
  pdf_page: number
  x: number
  y: number
  width: number
  height: number
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
  quality?: 'low' | 'medium' | 'high'
  getCurrentNotesText?: () => string
}

const CONNECTION_JSON_SYSTEM_PROMPT = `You are an expert legal connection mapper.

Task:
You will receive a judgment PDF and case notes. Return only a JSON array of note-to-PDF connections.

Scope you are allowed to connect:
- Notes titles and subtitles only (headings like h1/h2/h3 style text)
- Bold text only (including bold case names in tables)
- Table entries only when they are bold case law references

Scope you must NOT connect:
- Normal paragraph sentences
- Non-bold table content
- Any inferred or guessed text

Connection quality rules:
- Every connection must map to the exact source paragraph in the judgment PDF
- Paragraph mapping must be accurate and stable
- Do not create duplicate or overlapping connections for the same anchor
- Keep link labels short and clear

Output format:
- Output only JSON array (no markdown, no code block, no explanation)
- Each object must include:
  - linkId (string, unique, lowercase with hyphens)
  - noteAnchor (exact heading/bold text from notes)
  - pdfPage (number)
  - pdfSearchText (first 8-12 words from start of target paragraph, verbatim)
  - pdfSearchTextEnd (last 6-10 words from end of same paragraph, verbatim)
  - label (1-3 words)
  - color (hex color)

Validation before final output:
- Ensure noteAnchor exists exactly in notes
- Ensure pdfSearchText and pdfSearchTextEnd both exist on the same PDF page and same paragraph
- Ensure all connections are from allowed scope only
- If a candidate is uncertain, drop it (do not guess)
`

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
  quality = 'high',
  getCurrentNotesText,
}: JudgmentPdfPanelProps) {

  const allowTagging = connectMode && connectStep === null
  const allowManualConnectCapture = connectMode && connectStep === 'pdf'
  const SCALE = getScale(quality)

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
  const aiSummarizeAbortRef = useRef<AbortController | null>(null)
  const [zoomLevel, setZoomLevel] = useState(1.0)
  
  // Pinch-to-zoom state
  const initialPinchDistance = useRef<number>(0)
  const initialZoomLevel = useRef<number>(1.0)
  
  // Drag-to-zoom state
  const dragZoomStartY = useRef<number>(0)
  const dragZoomStartLevel = useRef<number>(1.0)
  const isDragZooming = useRef<boolean>(false)

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
  const [reconnectTargetId, setReconnectTargetId] = useState<string | null>(null)
  const [reconnectCapture, setReconnectCapture] = useState<ConnectPdfCapture | null>(null)
  const [reconnectSaving, setReconnectSaving] = useState(false)
  const [colorPickerOpenId, setColorPickerOpenId] = useState<string | null>(null)
  const [readingProgress, setReadingProgress] = useState(0)
  const [showConnections, setShowConnections] = useState(true)
  const [isDropzoneActive, setIsDropzoneActive] = useState(false)
  const autoFitAppliedRef = useRef(false)
  const [pdfDarkMode, setPdfDarkMode] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)

  const reconnectTargetLink = reconnectTargetId ? links.find(l => l.id === reconnectTargetId) ?? null : null
  const reconnectMode = !!reconnectTargetLink

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
    dest?: any; url?: string; targetPage?: number
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

  // Reset reconnect state when item changes or a fresh connect workflow starts.
  useEffect(() => {
    setReconnectTargetId(null)
    setReconnectCapture(null)
    setReconnectSaving(false)
  }, [itemId, connectMode])


  // ── Ctrl+Scroll Zoom Handler ──
  useEffect(() => {
    const el = pdfScrollRef.current
    if (!el) return
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const zoomDelta = -(e.deltaY * 0.002) // Smooth scaling based on wheel delta magnitude
        setZoomLevel(prev => Math.min(Math.max(0.25, prev + zoomDelta), 3.0))
      }
    }
    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [])

  // ── Pinch-to-Zoom Handler (Touch & Trackpad) ──
  useEffect(() => {
    const el = pdfScrollRef.current
    if (!el) return

    const getDistance = (touches: TouchList): number => {
      if (touches.length < 2) return 0
      const dx = touches[0].clientX - touches[1].clientX
      const dy = touches[0].clientY - touches[1].clientY
      return Math.sqrt(dx * dx + dy * dy)
    }

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        initialPinchDistance.current = getDistance(e.touches)
        initialZoomLevel.current = zoomLevel
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && initialPinchDistance.current > 0) {
        e.preventDefault()
        const currentDistance = getDistance(e.touches)
        const scaleRatio = currentDistance / initialPinchDistance.current
        const newZoom = Math.min(Math.max(0.25, initialZoomLevel.current * scaleRatio), 3.0)
        setZoomLevel(newZoom)
      }
    }

    const handleTouchEnd = () => {
      initialPinchDistance.current = 0
    }

    el.addEventListener('touchstart', handleTouchStart, { passive: true })
    el.addEventListener('touchmove', handleTouchMove, { passive: false })
    el.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      el.removeEventListener('touchstart', handleTouchStart)
      el.removeEventListener('touchmove', handleTouchMove)
      el.removeEventListener('touchend', handleTouchEnd)
    }
  }, [zoomLevel])

  // ── Drag-to-Zoom Handler (Alt+drag vertically) ──
  useEffect(() => {
    const el = pdfScrollRef.current
    if (!el) return

    const handleMouseDown = (e: MouseEvent) => {
      // Only enable drag-to-zoom when not in tagging mode
      if (allowTagging) return
      // Require Alt key to avoid conflict with scrolling
      if (e.button === 0 && e.altKey) {
        e.preventDefault()
        dragZoomStartY.current = e.clientY
        dragZoomStartLevel.current = zoomLevel
        isDragZooming.current = true
        el.style.cursor = 'ns-resize'
      }
    }

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragZooming.current) return
      e.preventDefault()
      const deltaY = dragZoomStartY.current - e.clientY
      const zoomFactor = 1 + (deltaY / 150) // 150px drag = 2x zoom
      const newZoom = Math.min(Math.max(0.25, dragZoomStartLevel.current * zoomFactor), 3.0)
      setZoomLevel(newZoom)
    }

    const handleMouseUp = () => {
      isDragZooming.current = false
      el.style.cursor = ''
    }

    el.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)

    return () => {
      el.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [allowTagging, zoomLevel])

  // ── Load PDF URL on mount ──────────────────────────────────────────
  useEffect(() => {
    async function loadPdfUrl() {
      setSignedUrl(`/api/judgment/pdf-proxy?itemId=${itemId}`)
    }
    loadPdfUrl()
  }, [itemId])

  const applyInitialFitToWidth = useCallback(() => {
    if (autoFitAppliedRef.current) return
    const container = pdfScrollRef.current
    if (!container || numPages === 0) return

    const firstPageWidth = pageStates[1]?.width ?? (612 * SCALE)
    const availableWidth = Math.max(0, container.clientWidth - 32)
    if (firstPageWidth <= 0 || availableWidth <= 0) return

    const fitZoom = Math.min(1, Math.max(0.25, availableWidth / firstPageWidth))
    setZoomLevel(fitZoom)
    autoFitAppliedRef.current = true
  }, [numPages, pageStates, SCALE])

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
    const renderedW = Math.max(link.width * SCALE, 8) * zoomLevel
    const renderedH = Math.max(link.height * SCALE, 8) * zoomLevel
    const storedW = link.width * SCALE * zoomLevel
    const storedH = link.height * SCALE * zoomLevel
    const padX = Math.max(0, renderedW - storedW) / 2
    const padY = Math.max(0, renderedH - storedH) / 2
    const regionLeft = pageRect.left + link.x * SCALE * zoomLevel - padX
    const regionTop = pageRect.top + (unzoomedCanvasH - (link.y + link.height)) * SCALE * zoomLevel - padY
    const toX = regionLeft + renderedW / 2
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
      toX,
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

  function scrollToPage(pageNum: number) {
    const pdfContainer = pdfScrollRef.current
    const pageEl = pageContainerRefs.current.get(pageNum)
    if (!pageEl || !pdfContainer) return

    const containerRect = pdfContainer.getBoundingClientRect()
    const pageRect = pageEl.getBoundingClientRect()
    const pageTopInContainer = pageRect.top - containerRect.top + pdfContainer.scrollTop
    const target = Math.max(0, pageTopInContainer - 12)

    setCurrentPage(pageNum)
    pdfContainer.scrollTo({ top: target, behavior: 'smooth' })
  }

  const updateCurrentPageFromScroll = useCallback(() => {
    const pdfContainer = pdfScrollRef.current
    if (!pdfContainer || numPages === 0) return

    const containerRect = pdfContainer.getBoundingClientRect()
    let closestPage = 1
    let closestDistance = Number.POSITIVE_INFINITY

    for (let i = 1; i <= numPages; i++) {
      const pageEl = pageContainerRefs.current.get(i)
      if (!pageEl) continue
      const pageRect = pageEl.getBoundingClientRect()
      const distance = Math.abs(pageRect.top - containerRect.top - 18)
      if (distance < closestDistance) {
        closestDistance = distance
        closestPage = i
      }
    }

    setCurrentPage(prev => (prev === closestPage ? prev : closestPage))
  }, [numPages])

  const navigateToDest = async (dest: any) => {
    if (!pdfDocRef.current) return

    let pageIndex = -1
    try {
      let destArray = dest
      if (typeof dest === 'string') {
        destArray = await pdfDocRef.current.getDestination(dest)
      }
      if (Array.isArray(destArray) && destArray.length > 0) {
        pageIndex = await pdfDocRef.current.getPageIndex(destArray[0])
      }
    } catch {
      // Destination resolution error - non-critical
    }

    if (pageIndex === -1) return

    const targetPage = pageIndex + 1

    // Force render the target page if not already rendered
    if (!pageStates[targetPage]?.rendered) {
      await renderPage(targetPage)
    }

    // Wait a bit for the render to complete, then scroll
    setTimeout(() => {
      const pageEl = pageContainerRefs.current.get(targetPage)
      if (!pageEl) return

      try {
        if (pdfScrollRef.current) {
          const containerRect = pdfScrollRef.current.getBoundingClientRect()
          const pageRect = pageEl.getBoundingClientRect()
          const targetTop = pdfScrollRef.current.scrollTop + (pageRect.top - containerRect.top)
          pdfScrollRef.current.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
        }
      } catch {
        // Navigation error - non-critical
      }
    }, 200)
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
        try {
          const annotations = await page.getAnnotations()
          const linkAnns = await Promise.all(
            annotations
              .filter((a: any) => a.subtype === 'Link' && (a.dest || a.url || a.unsafeUrl || a.action?.URI))
              .map(async (a: any) => {
                const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle(a.rect)
                const dest = a.dest
                let targetPage: number | undefined
                if (dest && pdfDocRef.current) {
                  try {
                    let destArray = dest
                    if (typeof dest === 'string') {
                      destArray = await pdfDocRef.current.getDestination(dest)
                    }
                    if (Array.isArray(destArray) && destArray.length > 0) {
                      const pageIndex = await pdfDocRef.current.getPageIndex(destArray[0])
                      targetPage = pageIndex + 1
                    }
                  } catch {
                    // non-critical: tooltip can fall back to generic label
                  }
                }

                return {
                  left: Math.min(vx1, vx2),
                  top: Math.min(vy1, vy2),
                  width: Math.abs(vx2 - vx1),
                  height: Math.abs(vy2 - vy1),
                  dest,
                  url: a.url || a.unsafeUrl || a.action?.URI,
                  targetPage,
                }
              })
          )
          pageAnnotationsRef.current[pageNum] = true
          if (linkAnns.length > 0) {
            setPageAnnotations(prev => ({ ...prev, [pageNum]: linkAnns }))
          }
        } catch {
          // annotations are non-critical; allow retry on next render attempt
          pageAnnotationsRef.current[pageNum] = false
        }
      }

      setPageStates(prev => ({
        ...prev,
        [pageNum]: { rendered: true, width: viewport.width, height: viewport.height },
      }))
    } catch (err) {
      console.error(`Page ${pageNum} render error:`, err)
    }
  }, [SCALE])

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
    let cancelled = false
    async function load() {
      setPdfLoading(true)
      setPdfError(null)
      renderedPages.current.clear()
      setPageStates({})
      setPageAnnotations({})
      pageAnnotationsRef.current = {}
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
    return () => {
      cancelled = true
      window.removeEventListener('keydown', handler)
    }
  }, [signedUrl])

  useEffect(() => {
    autoFitAppliedRef.current = false
  }, [signedUrl])

  useEffect(() => {
    if (!signedUrl || pdfLoading || pdfError) return
    const frame = window.requestAnimationFrame(() => {
      applyInitialFitToWidth()
    })
    return () => window.cancelAnimationFrame(frame)
  }, [signedUrl, pdfLoading, pdfError, numPages, pageStates, applyInitialFitToWidth])

  useEffect(() => {
    if (numPages === 0) return
    const observer = new IntersectionObserver(
      entries => entries.forEach(entry => {
        if (entry.isIntersecting) {
          const n = parseInt((entry.target as HTMLElement).dataset.pageNum || '0', 10)
          if (n > 0) renderPage(n)
        }
      }),
      { rootMargin: '1000px' }
    )
    for (let i = 1; i <= numPages; i++) {
      const el = pageContainerRefs.current.get(i)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [numPages, renderPage])

  useEffect(() => {
    if (!signedUrl || numPages === 0) {
      setCurrentPage(1)
      return
    }
    updateCurrentPageFromScroll()
  }, [signedUrl, numPages, updateCurrentPageFromScroll])

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
      setPageAnnotations({})
      pageAnnotationsRef.current = {}
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
    if (!allowTagging && !allowManualConnectCapture && !reconnectMode) return
    if (allowManualConnectCapture && connectPdfCapture) return
    if (reconnectMode && reconnectCapture) return
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
        // Use display/CSS height (not device-pixel backing height) so stored PDF coords
        // match the user's drawn box on HiDPI screens.
        const displayCanvasH = canvas.clientHeight || pageStates[dragState.pageNum]?.height || 792 * SCALE
        const pageHeightPdf = displayCanvasH / SCALE
        const region = {
          page: dragState.pageNum,
          x: mouseX / SCALE,
          y: pageHeightPdf - mouseY / SCALE - mouseH / SCALE,
          width: mouseW / SCALE,
          height: mouseH / SCALE,
        }
        if (allowManualConnectCapture) {
          onConnectPdfCapture({
            ...region,
            text: `Manual region on page ${region.page}`,
          })
        } else if (reconnectMode) {
          setReconnectCapture({
            ...region,
            text: `Manual region on page ${region.page}`,
          })
        } else {
          handleRegionSelected(region)
        }
      }
    }
    setDragState(null)
  }

  // ── Connect mode: PDF text selection ──────────────────────────────
  function buildRangeNeedles(text: string): { start: string; end?: string } {
    const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
    if (words.length === 0) return { start: '' }
    if (words.length < 8) return { start: words.join(' ') }
    return {
      start: words.slice(0, 8).join(' '),
      end: words.slice(-8).join(' '),
    }
  }

  function isPdfFile(file: File): boolean {
    return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
  }

  async function handlePdfFileSelected(file: File) {
    if (!isPdfFile(file)) {
      toast.error('Please upload a PDF file')
      return
    }
    await handlePdfUpload(file)
  }

  async function handlePdfTextMouseUp(e: React.MouseEvent, pageNum: number) {
    if (!connectMode || connectStep !== 'pdf' || connectPdfCapture) return
    const sel = window.getSelection()
    let selectedText = sel?.toString().trim() ?? ''
    if (!selectedText) {
      const clickedWord = (e.target as HTMLElement).closest('.pdfTextLayer span') as HTMLElement | null
      selectedText = clickedWord?.textContent?.trim() ?? ''
    }
    if (!selectedText) return

    if (pdfDocRef.current) {
      try {
        const page = await pdfDocRef.current.getPage(pageNum)
        const content = await page.getTextContent()
        const { start, end } = buildRangeNeedles(selectedText)
        const precise = findTextInPageData(
          [{ pageNum, items: content.items as any[] }],
          start,
          pageNum,
          end,
        )

        if (precise) {
          onConnectPdfCapture({
            page: pageNum,
            x: precise.x,
            y: precise.y,
            width: precise.width,
            height: precise.height,
            text: selectedText,
          })
          return
        }
      } catch (err) {
        console.warn('Precise PDF match failed, falling back to selection bounds:', err)
      }
    }

    if (!sel || sel.rangeCount === 0) return
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    const pageEl = pageContainerRefs.current.get(pageNum)
    if (!pageEl) return
    const pageRect = pageEl.getBoundingClientRect()
    const canvas = canvasRefs.current.get(pageNum)
    // Same HiDPI fix as drag capture: rely on display height, not backing bitmap size.
    const displayCanvasH = canvas?.clientHeight || pageStates[pageNum]?.height || 792 * SCALE
    onConnectPdfCapture({
      page: pageNum,
      x: (rect.left - pageRect.left) / (SCALE * zoomLevel),
      y: (displayCanvasH / SCALE) - ((rect.top - pageRect.top) / (SCALE * zoomLevel)) - (rect.height / (SCALE * zoomLevel)),
      width: Math.max(rect.width / (SCALE * zoomLevel), 10),
      height: Math.max(rect.height / (SCALE * zoomLevel), 8),
      text: selectedText,
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

  function beginReconnect(link: NotePdfLink) {
    if (connectMode) {
      toast.info('Finish current connect flow first')
      return
    }
    setReconnectTargetId(link.id)
    setReconnectCapture(null)
    setColorPickerOpenId(null)
    onHighlightedLinkIdChange(link.link_id)
    onScrollNotes?.(link.link_id)
    scrollToLink(link)
    setTimeout(() => onConnectionVizChange(computeConnection(link.link_id)), 300)
    toast.info('Reconnect mode: drag on PDF to set the new box')
  }

  function cancelReconnect() {
    setReconnectTargetId(null)
    setReconnectCapture(null)
    setReconnectSaving(false)
    onHighlightedLinkIdChange(null)
  }

  async function saveReconnect() {
    if (!reconnectTargetLink || !reconnectCapture) return
    const nextRegion: LinkRegion = {
      pdf_page: reconnectCapture.page,
      x: reconnectCapture.x,
      y: reconnectCapture.y,
      width: reconnectCapture.width,
      height: reconnectCapture.height,
    }

    const sameRegion = (a: LinkRegion, b: LinkRegion) => (
      a.pdf_page === b.pdf_page &&
      Math.abs(a.x - b.x) < 0.001 &&
      Math.abs(a.y - b.y) < 0.001 &&
      Math.abs(a.width - b.width) < 0.001 &&
      Math.abs(a.height - b.height) < 0.001
    )

    const fetchPersistedLinks = async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const fresh = await fetchLinksForItem(itemId)
        const target = fresh.find(l => l.id === reconnectTargetLink.id)
        if (target && sameRegion(nextRegion, {
          pdf_page: target.pdf_page,
          x: target.x,
          y: target.y,
          width: target.width,
          height: target.height,
        })) {
          return fresh
        }
        await new Promise(resolve => setTimeout(resolve, 250))
      }
      return null
    }

    setReconnectSaving(true)

    try {
      let persistedLinks: NotePdfLink[] | null = null

      try {
        await updateLinkRegion({
          id: reconnectTargetLink.id,
          ...nextRegion,
        })
        persistedLinks = await fetchPersistedLinks()
      } catch {
        // Fallback path: replace old link with a newly inserted link at the new region.
        const replacement = await insertLink({
          item_id: reconnectTargetLink.item_id,
          link_id: reconnectTargetLink.link_id,
          pdf_page: nextRegion.pdf_page,
          x: nextRegion.x,
          y: nextRegion.y,
          width: nextRegion.width,
          height: nextRegion.height,
          label: reconnectTargetLink.label ?? undefined,
        })
        await deleteLink(reconnectTargetLink.id)
        persistedLinks = await fetchLinksForItem(itemId)

        // Safety net in case fetch still races; ensure local list contains the replacement.
        if (!persistedLinks.some(l => l.id === replacement.id)) {
          persistedLinks = null
        }
      }

      if (!persistedLinks) {
        throw new Error('Reconnect was not persisted. Please try once more.')
      }

      onLinksChange(() => persistedLinks)
      toast.success(`Reconnected "${reconnectTargetLink.link_id}" to page ${nextRegion.pdf_page}`)
      onHighlightedLinkIdChange(reconnectTargetLink.link_id)
      setTimeout(() => onConnectionVizChange(computeConnection(reconnectTargetLink.link_id)), 100)
      setTimeout(() => onHighlightedLinkIdChange(null), CONNECTION_HIGHLIGHT_MS)
      setReconnectTargetId(null)
      setReconnectCapture(null)
    } catch (err: any) {
      toast.error(err?.message || 'Failed to reconnect')
    } finally {
      setReconnectSaving(false)
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
      if (reconnectTargetId === linkToDelete?.id) {
        setReconnectTargetId(null)
        setReconnectCapture(null)
      }
    } finally {
      setDeletingId(null)
    }
  }

  // ── AI helpers ────────────────────────────────────────────────────

  /** Copy text to clipboard with a toast. */
  async function copyToClipboard(text: string, description: string) {
    try {
        await navigator.clipboard.writeText(text)
        toast.success(`${description} copied to clipboard`)
    } catch (err: any) {
        toast.error('Failed to copy: ' + err.message)
    }
  }

  /** Copies the base connection-mapping system instructions. */
  function handleCopySystemPrompt() {
    copyToClipboard(CONNECTION_JSON_SYSTEM_PROMPT, 'System prompt')
  }

  /** Copies system prompt + currently written notes text. */
  async function handleCopySystemPromptWithNotes() {
    const notesText = getCurrentNotesText?.().trim() ?? ''
    if (!notesText) {
      toast.error('No notes found to include. Write notes first.')
      return
    }

    const fullPrompt = `${CONNECTION_JSON_SYSTEM_PROMPT}\n\nNOTES (use these exact anchors):\n${notesText}`
    await copyToClipboard(fullPrompt, 'System prompt + notes')
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
    if (aiSummarizing) {
      aiSummarizeAbortRef.current?.abort()
      return
    }
    if (!pdfDocRef.current) {
      toast.error('No PDF loaded — upload a judgment PDF first')
      return
    }
    if (!onAiNotesGenerated) return
    setAiSummarizing(true)
    const abortController = new AbortController()
    aiSummarizeAbortRef.current = abortController
    const toastId = toast.loading('📄 Extracting text from PDF…')
    try {
      // Extract text from every page — keep items with positions for auto-linking
      const pageData: { pageNum: number; items: any[] }[] = []
      const parts: string[] = []
      const total: number = pdfDocRef.current.numPages
      for (let i = 1; i <= total; i++) {
        if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError')
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
        signal: abortController.signal,
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
      if (e?.name === 'AbortError') {
        toast.dismiss(toastId)
        toast.message('AI notes generation stopped')
        return
      }
      toast.error(e.message || 'AI summarization failed', { id: toastId })
    } finally {
      aiSummarizeAbortRef.current = null
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
      <div className="relative flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/85 shrink-0">
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          <span className="font-semibold text-sm text-foreground">Judgment PDF</span>
          {links.length > 0 && (
            <span className="flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
              <Link2 className="w-3 h-3" />
              <span className="tabular-nums">{links.length}</span>
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
        <div className="w-full flex items-center justify-center gap-2 flex-wrap">
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) handlePdfFileSelected(f)
              e.target.value = ''
            }}
          />
          {/* AI Notes button — only visible when PDF is loaded */}
          {signedUrl && onAiNotesGenerated && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleAiSummarize}
                disabled={pdfLoading}
                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all bg-linear-to-r from-violet-500 to-purple-600 text-white hover:from-violet-600 hover:to-purple-700 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title={aiSummarizing ? 'Stop generating AI notes' : 'Generate AI notes'}
              >
                {aiSummarizing
                  ? <Square className="w-3 h-3 fill-current" />
                  : <Sparkles className="w-3 h-3" />
                }
                Notes
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold transition-all border border-border bg-background hover:bg-muted text-foreground group"
                  >
                    <Link2 className="w-3.5 h-3.5" />
                    Copy
                    <ChevronDown className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground">
                    Connection JSON Prompt
                  </div>
                  <DropdownMenuItem
                    onClick={handleCopySystemPrompt}
                    className="gap-2"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>Only System Prompt</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={handleCopySystemPromptWithNotes}
                    className="gap-2"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>System Prompt + Current Notes</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingPdf || deletingPdf}
            className="h-8 px-3 rounded-lg text-xs"
          >
            {uploadingPdf ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Upload className="w-3.5 h-3.5 mr-1" />}
            {uploadingPdf ? 'Uploading…' : signedUrl ? 'Replace' : 'Upload PDF'}
          </Button>

          {/* Search bar */}
          {signedUrl && (
            <div className="flex items-center gap-1">
              {searchOpen && (
                <div className="flex items-center gap-1 bg-muted/80 rounded-lg border border-border px-2 h-8">
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
                className={cn('h-8 w-8 p-0 rounded-lg', searchOpen && 'bg-muted')}
                title="Search in PDF (Ctrl+F)"
              >
                <Search className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {signedUrl && numPages > 0 && (
            <Select
              value={String(currentPage)}
              onValueChange={value => {
                const pageNum = Number.parseInt(value, 10)
                if (!Number.isNaN(pageNum)) {
                  scrollToPage(pageNum)
                }
              }}
            >
              <SelectTrigger
                className={cn(
                  "h-8 w-[92px] min-w-0 px-2 rounded-lg text-xs font-semibold shadow-sm",
                  pdfDarkMode
                    ? "border-slate-700/90 bg-slate-900 text-slate-100 hover:bg-slate-800/90 focus-visible:ring-slate-500/40"
                    : "border-border bg-background/90 text-foreground hover:bg-background"
                )}
                title="Jump to page"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                align="end"
                className={cn(
                  "max-h-72",
                  pdfDarkMode && "border-slate-700 bg-slate-900 text-slate-100"
                )}
              >
                {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => (
                  <SelectItem
                    key={pageNum}
                    value={String(pageNum)}
                    className={cn(
                      "text-xs",
                      pdfDarkMode && "focus:bg-slate-800 focus:text-slate-100"
                    )}
                  >
                    Page {pageNum}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {signedUrl && (
            <div className="flex items-center gap-px bg-muted/60 p-0.5 rounded-lg border border-border h-8">
              <button onClick={() => setZoomLevel(p => Math.max(0.25, p - 0.1))} className="w-7 h-7 flex items-center justify-center text-xs hover:bg-background rounded-md text-muted-foreground hover:text-foreground" title="Zoom Out">-</button>
              <button onClick={() => setZoomLevel(1.0)} className="px-2 h-7 flex items-center justify-center text-[11px] hover:bg-background rounded-md font-mono text-muted-foreground hover:text-foreground" title="Reset Zoom">{Math.round(zoomLevel * 100)}%</button>
              <button onClick={() => setZoomLevel(p => Math.min(3.0, p + 0.1))} className="w-7 h-7 flex items-center justify-center text-xs hover:bg-background rounded-md text-muted-foreground hover:text-foreground" title="Zoom In">+</button>
            </div>
          )}
          {signedUrl && (
            <Button
              size="sm"
              variant={pdfDarkMode ? "secondary" : "ghost"}
              onClick={() => setPdfDarkMode(v => !v)}
              className="h-8 px-2.5 rounded-lg text-xs"
              title={pdfDarkMode ? "Disable PDF dark mode" : "Enable PDF dark mode"}
            >
              <Moon className="w-3.5 h-3.5 mr-1" />
              PDF Dark
            </Button>
          )}
          {signedUrl && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDeletePdf}
              disabled={deletingPdf}
              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8 p-0 rounded-lg"
              title="Remove PDF"
            >
              {deletingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash className="w-3.5 h-3.5" />}
            </Button>
          )}
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
                ? `PDF region captured: page ${connectPdfCapture.page}`
                : 'Drag on the PDF to draw the exact connection box'
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

      {reconnectMode && reconnectTargetLink && (
        <div className={cn(
          'px-4 py-2 border-b shrink-0 flex items-center justify-between gap-2',
          reconnectCapture
            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/30'
            : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/30'
        )}>
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn(
              'text-xs font-semibold px-1.5 py-0.5 rounded shrink-0',
              reconnectCapture
                ? 'bg-emerald-200 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200'
            )}>
              Reconnect
            </span>
            <span className={cn(
              'text-xs truncate',
              reconnectCapture ? 'text-emerald-800 dark:text-emerald-300' : 'text-amber-800 dark:text-amber-300',
            )}>
              {reconnectCapture
                ? `"${reconnectTargetLink.link_id}" → page ${reconnectCapture.page} ready to save`
                : `Draw a new PDF box for "${reconnectTargetLink.link_id}"`
              }
            </span>
          </div>
          <div className="flex gap-1.5 shrink-0">
            {reconnectCapture && (
              <Button
                size="sm"
                className="h-6 text-xs bg-emerald-600 hover:bg-emerald-700 text-white border-0 px-2"
                onClick={saveReconnect}
                disabled={reconnectSaving}
              >
                {reconnectSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              onClick={reconnectCapture ? () => setReconnectCapture(null) : cancelReconnect}
            >
              {reconnectCapture ? 'Re-select' : 'Cancel'}
            </Button>
          </div>
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
          requestAnimationFrame(() => {
            redrawConnection()
            updateCurrentPageFromScroll()
          })
        }}
      >

          {!signedUrl ? (
          <div className="flex items-center justify-center h-full p-6">
            <div
              className={cn(
                'w-full max-w-xl rounded-2xl border-2 border-dashed p-8 text-center transition-colors',
                isDropzoneActive ? 'border-primary bg-primary/5' : 'border-border bg-card',
                (uploadingPdf || deletingPdf) && 'opacity-70 pointer-events-none',
              )}
              onDragEnter={e => {
                e.preventDefault()
                if (!uploadingPdf && !deletingPdf) setIsDropzoneActive(true)
              }}
              onDragOver={e => {
                e.preventDefault()
                if (!uploadingPdf && !deletingPdf) setIsDropzoneActive(true)
              }}
              onDragLeave={e => {
                e.preventDefault()
                const related = e.relatedTarget as Node | null
                if (!related || !e.currentTarget.contains(related)) setIsDropzoneActive(false)
              }}
              onDrop={e => {
                e.preventDefault()
                setIsDropzoneActive(false)
                if (uploadingPdf || deletingPdf) return
                const f = e.dataTransfer.files?.[0]
                if (f) void handlePdfFileSelected(f)
              }}
            >
              <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
                <FileText className="w-7 h-7 text-muted-foreground/60" />
              </div>
              <p className="text-sm font-semibold text-foreground">Drag and drop judgment PDF here</p>
              <p className="text-xs text-muted-foreground mt-1">or click below to upload/replace PDF</p>
              <Button onClick={() => fileInputRef.current?.click()} size="sm" className="mt-4">
                <Upload className="w-4 h-4 mr-2" />
                {uploadingPdf ? 'Uploading…' : 'Upload PDF'}
              </Button>
            </div>
          </div>
        ) : pdfLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
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
                    <div className="flex items-center gap-2 mb-2">
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Page {pageNum}
                      </p>
                      {ps?.rendered && (!pageAnnotations[pageNum] || pageAnnotations[pageNum].length === 0) && !connectMode && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground/60">
                          No links
                        </span>
                      )}
                    </div>
                    <div
                      ref={el => { if (el) pageContainerRefs.current.set(pageNum, el) }}
                      data-page-num={pageNum}
                      className="relative rounded-sm overflow-hidden border border-border shadow-sm bg-white"
                      style={{ width: canvasW, height: canvasH, background: pdfDarkMode ? '#3a3a3a' : '#ffffff' }}
                    >
                      <div
                        className="absolute inset-0"
                        style={pdfDarkMode ? { filter: 'invert(1) hue-rotate(180deg) contrast(0.78) brightness(1.06)' } : undefined}
                      >
                        <canvas
                          ref={el => { if (el) canvasRefs.current.set(pageNum, el) }}
                          style={{ display: 'block' }}
                        />

                        {/* Text layer for search/selection */}
                        <div
                          ref={el => { if (el) textLayerContainerRefs.current.set(pageNum, el) }}
                          className={cn('pdfTextLayer')}
                          onMouseUp={(allowManualConnectCapture || reconnectMode) ? undefined : (e => handlePdfTextMouseUp(e, pageNum))}
                        />
                      </div>

                      {/* Existing link overlays */}
                      {ps?.rendered && pageLinks.map(link => {
                        const sw = Math.max(link.width * SCALE, 8)
                        const sh = Math.max(link.height * SCALE, 8)
                        const padX = Math.max(0, sw - link.width * SCALE) / 2
                        const padY = Math.max(0, sh - link.height * SCALE) / 2
                        // PDF y-origin is bottom-left, convert to top-left canvas coords.
                        const sx = link.x * SCALE - padX
                        const sy = canvasH - (link.y + link.height) * SCALE - padY
                        const isHighlighted = highlightedLinkId === link.link_id
                        const isConnected = connectionViz?.linkId === link.link_id
                        const { text: linkLabel, color: linkColor } = parseLinkMeta(link.label)

                        return (
                          <div
                            key={link.id}
                            title={`${link.link_id}${linkLabel ? ` — ${linkLabel}` : ''}`}
                            className={cn('absolute group', isHighlighted && `lf_${link.link_id.replace(/[^a-zA-Z0-9]/g, '_')}`)}
                            style={{
                              left: sx, top: sy, width: sw, height: sh,
                              background: isHighlighted
                                ? `${linkColor}30`
                                : isConnected
                                ? `${linkColor}22`
                                : `${linkColor}12`,
                              border: `${isHighlighted || isConnected ? '2' : '1.5'}px solid ${isHighlighted || isConnected ? linkColor : `${linkColor}99`}`,
                              borderRadius: 3,
                              zIndex: isConnected ? 7 : 5,
                              pointerEvents: inPdfSelectStep ? 'none' : 'all',
                              transition: 'background 0.15s, border-color 0.15s',
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
                          className="absolute group"
                          style={{
                            left: ann.left, top: ann.top,
                            width: Math.max(ann.width, 20), height: Math.max(ann.height, 20),
                            zIndex: 15,
                            cursor: connectMode ? 'default' : 'pointer',
                            pointerEvents: connectMode ? 'none' : 'all',
                          }}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (connectMode) return
                            if (ann.url) window.open(ann.url, '_blank', 'noopener,noreferrer')
                            else if (ann.dest) navigateToDest(ann.dest)
                          }}
                        >
                          <div className="absolute bottom-full left-0 mb-1 px-2 py-1 rounded-md text-xs font-semibold whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 bg-popover text-popover-foreground border border-border shadow-md">
                            {ann.url
                              ? 'Open link'
                              : typeof ann.targetPage === 'number'
                              ? `Jump to page ${ann.targetPage}`
                              : 'Jump to linked page'}
                          </div>
                        </div>
                      ))}

                      {/* Drag overlay — used for tag creation and manual connect capture */}
                      {(allowTagging || (allowManualConnectCapture && !connectPdfCapture) || (reconnectMode && !reconnectCapture)) && (
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
                const isReconnectTarget = reconnectTargetId === link.id
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
                        setTimeout(() => onHighlightedLinkIdChange(null), CONNECTION_HIGHLIGHT_MS)
                      }}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2.5 cursor-pointer group transition-colors',
                        isReconnectTarget ? 'bg-amber-100/60 dark:bg-amber-950/30' : isActive ? 'bg-muted/60' : 'hover:bg-muted/50'
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
                        onClick={e => { e.stopPropagation(); beginReconnect(link) }}
                        disabled={deletingId === link.id || reconnectSaving}
                        className={cn(
                          'transition-opacity p-1 rounded hover:bg-amber-500/15 text-muted-foreground hover:text-amber-600 disabled:opacity-30 shrink-0',
                          isReconnectTarget ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        )}
                        title="Reconnect PDF position"
                      >
                        <RefreshCw className={cn("w-3.5 h-3.5", isReconnectTarget && "text-amber-600")} />
                      </button>
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
  region: Region | null;
  existingLinkIds: string[];
  onSave: (linkId: string, label: string, color: string) => Promise<void>;
  onClose: () => void;
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

  if (!region) return null

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-xl p-6 w-80 max-w-[90vw]" onClick={e => e.stopPropagation()}>
        <h3 className="font-bold text-sm mb-1">Tag PDF Region</h3>
        <p className="text-xs text-muted-foreground mb-4">Page {region?.page}</p>
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

