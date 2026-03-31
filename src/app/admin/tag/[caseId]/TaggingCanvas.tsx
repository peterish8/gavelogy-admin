'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import type { NotePdfLink } from '@/actions/judgment/links'

const SCALE = 1.3

interface Region {
  page: number
  x: number
  y: number
  width: number
  height: number
}

interface TaggingCanvasProps {
  pdfUrl: string
  existingLinks: NotePdfLink[]
  onRegionSelected: (region: Region) => void
}

interface PageState {
  rendered: boolean
  width: number
  height: number
}

// Renders every PDF page onto individual <canvas> elements (lazy via IntersectionObserver) and lets the user drag-select a highlight region.
export default function TaggingCanvas({
  pdfUrl,
  existingLinks,
  onRegionSelected,
}: TaggingCanvasProps) {
  const [numPages, setNumPages] = useState(0)
  const [pageStates, setPageStates] = useState<Record<number, PageState>>({})
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // Drag state
  const [dragState, setDragState] = useState<{
    pageNum: number
    startX: number
    startY: number
    currentX: number
    currentY: number
    active: boolean
  } | null>(null)

  const pdfDocRef = useRef<any>(null)
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map())
  const containerRefs = useRef<Map<number, HTMLDivElement>>(new Map())
  const observerRef = useRef<IntersectionObserver | null>(null)
  const renderedPages = useRef<Set<number>>(new Set())

  // Renders a single PDF page to its canvas at the configured SCALE; skips pages already rendered.
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

      await page.render({ canvas, viewport }).promise

      setPageStates((prev) => ({
        ...prev,
        [pageNum]: { rendered: true, width: viewport.width, height: viewport.height },
      }))
    } catch (err) {
      console.error(`Error rendering page ${pageNum}:`, err)
    }
  }, [])

  // Dynamically imports pdfjs-dist and loads the PDF document from the signed URL.
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        setLoading(true)
        setPdfError(null)

        const pdfjsLib = await import('pdfjs-dist')
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

        const doc = await pdfjsLib.getDocument(pdfUrl).promise
        if (cancelled) return

        pdfDocRef.current = doc
        setNumPages(doc.numPages)
        setLoading(false)
      } catch (err: any) {
        if (!cancelled) {
          setPdfError(err.message || 'Failed to load PDF')
          setLoading(false)
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [pdfUrl])

  // Observes each page container and triggers renderPage when it scrolls into the viewport (lazy rendering).
  useEffect(() => {
    if (numPages === 0) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const pageNum = parseInt(
              (entry.target as HTMLElement).dataset.pageNum || '0',
              10
            )
            if (pageNum > 0) renderPage(pageNum)
          }
        })
      },
      { rootMargin: '200px' }
    )

    for (let i = 1; i <= numPages; i++) {
      const el = containerRefs.current.get(i)
      if (el) observerRef.current.observe(el)
    }

    return () => observerRef.current?.disconnect()
  }, [numPages, renderPage])

  // Starts a drag selection on the page, recording the mouse-down coordinates relative to the page container.
  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>, pageNum: number) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setDragState({ pageNum, startX: x, startY: y, currentX: x, currentY: y, active: true })
  }

  // Updates the live selection rectangle as the mouse moves during a drag.
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragState?.active) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDragState((prev) =>
      prev
        ? {
            ...prev,
            currentX: e.clientX - rect.left,
            currentY: e.clientY - rect.top,
          }
        : null
    )
  }

  // Finalises the drag, converts screen coords to PDF units (accounting for SCALE and Y-flip), and calls onRegionSelected.
  function handleMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    if (!dragState?.active) return

    const rect = e.currentTarget.getBoundingClientRect()
    const endX = e.clientX - rect.left
    const endY = e.clientY - rect.top

    const mouseX = Math.min(dragState.startX, endX)
    const mouseY = Math.min(dragState.startY, endY)
    const mouseW = Math.abs(endX - dragState.startX)
    const mouseH = Math.abs(endY - dragState.startY)

    // Only fire if drag is big enough
    if (mouseW > 8 && mouseH > 8) {
      const canvas = canvasRefs.current.get(dragState.pageNum)
      if (canvas) {
        const pageHeightPdf = canvas.height / SCALE
        const pdfX = mouseX / SCALE
        const pdfH = mouseH / SCALE
        const pdfY = pageHeightPdf - mouseY / SCALE - pdfH
        const pdfW = mouseW / SCALE

        onRegionSelected({
          page: dragState.pageNum,
          x: pdfX,
          y: pdfY,
          width: pdfW,
          height: pdfH,
        })
      }
    }

    setDragState(null)
  }

  // Cancels any active drag when the cursor leaves the page container.
  function handleMouseLeave() {
    setDragState(null)
  }

  // Returns the normalised bounding box (top-left origin) of the active drag in screen pixels for the live overlay.
  function getSelectionRect() {
    if (!dragState?.active) return null
    const x = Math.min(dragState.startX, dragState.currentX)
    const y = Math.min(dragState.startY, dragState.currentY)
    const w = Math.abs(dragState.currentX - dragState.startX)
    const h = Math.abs(dragState.currentY - dragState.startY)
    return { x, y, w, h }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: '#c9922a' }}>
        <div className="text-center">
          <div
            className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin mx-auto mb-3"
            style={{ borderColor: '#c9922a', borderTopColor: 'transparent' }}
          />
          <p className="text-sm">Loading PDF…</p>
        </div>
      </div>
    )
  }

  if (pdfError) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-sm" style={{ color: '#f87171' }}>
          Failed to load PDF: {pdfError}
        </p>
      </div>
    )
  }

  const selRect = getSelectionRect()

  return (
    <div
      className="overflow-y-auto h-full"
      style={{ background: '#0a0805' }}
    >
      <div className="flex flex-col items-center gap-6 py-6 px-4">
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
          const pageLinks = existingLinks.filter((l) => l.pdf_page === pageNum)
          const ps = pageStates[pageNum]
          const canvasW = ps?.width || 612 * SCALE
          const canvasH = ps?.height || 792 * SCALE

          return (
            <div key={pageNum} className="flex flex-col items-center">
              {/* Page label */}
              <div
                className="text-xs font-semibold uppercase tracking-widest mb-2"
                style={{ color: '#78350f' }}
              >
                Page {pageNum}
              </div>

              {/* Page container */}
              <div
                ref={(el) => {
                  if (el) containerRefs.current.set(pageNum, el)
                }}
                data-page-num={pageNum}
                className="relative"
                style={{
                  width: canvasW,
                  height: canvasH,
                  border: '1px solid rgba(201,146,42,0.2)',
                  borderRadius: 4,
                  overflow: 'hidden',
                  background: '#1a1208',
                }}
              >
                {/* Canvas */}
                <canvas
                  ref={(el) => {
                    if (el) canvasRefs.current.set(pageNum, el)
                  }}
                  style={{ display: 'block' }}
                />

                {/* Existing link overlays */}
                {ps?.rendered &&
                  pageLinks.map((link) => {
                    const screenX = link.x * SCALE
                    const screenY = canvasH - (link.y + link.height) * SCALE
                    const screenW = link.width * SCALE
                    const screenH = link.height * SCALE

                    return (
                      <div
                        key={link.id}
                        title={`${link.link_id}${link.label ? ` — ${link.label}` : ''}`}
                        className="absolute group"
                        style={{
                          left: screenX,
                          top: screenY,
                          width: screenW,
                          height: screenH,
                          background: 'rgba(201,146,42,0.25)',
                          border: '1.5px solid rgba(201,146,42,0.7)',
                          borderRadius: 2,
                          zIndex: 5,
                          pointerEvents: 'all',
                          cursor: 'default',
                        }}
                      >
                        {/* Tooltip */}
                        <div
                          className="absolute bottom-full left-0 mb-1 px-2 py-1 rounded text-xs font-mono whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20"
                          style={{
                            background: '#150f04',
                            border: '1px solid rgba(201,146,42,0.4)',
                            color: '#fde68a',
                          }}
                        >
                          {link.link_id}
                          {link.label && <span style={{ color: '#78350f' }}> — {link.label}</span>}
                        </div>
                      </div>
                    )
                  })}

                {/* Drag interaction overlay */}
                <div
                  className="absolute inset-0"
                  style={{ cursor: 'crosshair', zIndex: 10 }}
                  onMouseDown={(e) => handleMouseDown(e, pageNum)}
                  onMouseMove={dragState?.pageNum === pageNum ? handleMouseMove : undefined}
                  onMouseUp={dragState?.pageNum === pageNum ? handleMouseUp : undefined}
                  onMouseLeave={dragState?.pageNum === pageNum ? handleMouseLeave : undefined}
                />

                {/* Live selection rect */}
                {dragState?.active && dragState.pageNum === pageNum && selRect && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: selRect.x,
                      top: selRect.y,
                      width: selRect.w,
                      height: selRect.h,
                      border: '2px dashed #c9922a',
                      background: 'rgba(201,146,42,0.12)',
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
  )
}
