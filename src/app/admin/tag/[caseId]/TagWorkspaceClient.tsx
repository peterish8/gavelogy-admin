'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { insertLink, deleteLink } from '@/actions/judgment/links'
import type { NotePdfLink } from '@/actions/judgment/links'
import TaggingCanvas from './TaggingCanvas'
import TagModal from './TagModal'
import { ArrowLeft, Trash2, FileText } from 'lucide-react'
import { toast } from 'sonner'

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
  signedUrl: string | null
  initialLinks: NotePdfLink[]
  noteContentLinkIds: string[]
}

export default function TagWorkspaceClient({
  caseId,
  caseTitle,
  signedUrl,
  initialLinks,
  noteContentLinkIds,
}: Props) {
  const [links, setLinks] = useState<NotePdfLink[]>(initialLinks)
  const [pendingRegion, setPendingRegion] = useState<Region | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const existingLinkIds = links.map((l) => l.link_id)

  const handleRegionSelected = useCallback((region: Region) => {
    setPendingRegion(region)
  }, [])

  async function handleSave(linkId: string, label: string) {
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
    setLinks((prev) => [...prev, newLink])
    setPendingRegion(null)
    toast.success(`Tagged "${linkId}" on page ${pendingRegion.page}`)
  }

  async function handleDelete(id: string) {
    setDeletingId(id)
    try {
      await deleteLink(id)
      setLinks((prev) => prev.filter((l) => l.id !== id))
      toast.success('Link deleted')
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ background: '#0f0e0b' }}
    >
      {/* Left: PDF canvas (70%) */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <div
          className="flex items-center gap-3 px-4 py-3 border-b shrink-0"
          style={{
            borderColor: 'rgba(120,53,15,0.3)',
            background: 'rgba(15,14,11,0.95)',
          }}
        >
          <Link
            href="/admin/tag"
            className="flex items-center gap-1.5 text-sm transition-colors"
            style={{ color: '#78350f' }}
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <div
            className="h-4 w-px"
            style={{ background: 'rgba(120,53,15,0.4)' }}
          />
          <span
            className="font-mono font-bold text-sm"
            style={{ color: '#fde68a' }}
          >
            {caseTitle}
          </span>
          <span className="text-xs ml-2" style={{ color: '#78350f' }}>
            Drag to tag a region
          </span>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden">
          {signedUrl ? (
            <TaggingCanvas
              pdfUrl={signedUrl}
              existingLinks={links}
              onRegionSelected={handleRegionSelected}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm" style={{ color: '#78350f' }}>
                No PDF uploaded.{' '}
                <Link href="/admin/tag" style={{ color: '#c9922a', textDecoration: 'underline' }}>
                  Go back
                </Link>{' '}
                and upload one.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right: Mappings sidebar (30%) */}
      <div
        className="w-72 shrink-0 flex flex-col border-l overflow-hidden"
        style={{
          borderColor: 'rgba(120,53,15,0.3)',
          background: 'rgba(10,8,5,0.9)',
        }}
      >
        {/* Sidebar header */}
        <div
          className="px-4 py-3 border-b shrink-0"
          style={{ borderColor: 'rgba(120,53,15,0.3)' }}
        >
          <h2 className="text-sm font-bold" style={{ color: '#fef3c7' }}>
            Mappings{' '}
            <span
              className="ml-1 px-1.5 py-0.5 rounded-full text-xs font-mono"
              style={{
                background: 'rgba(201,146,42,0.15)',
                color: '#c9922a',
              }}
            >
              {links.length}
            </span>
          </h2>
          <p className="text-xs mt-0.5" style={{ color: '#78350f' }}>
            Click trash to remove a tag
          </p>
        </div>

        {/* Links list */}
        <div className="flex-1 overflow-y-auto">
          {links.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-12 px-4">
              <FileText
                className="w-8 h-8 mb-3 opacity-20"
                style={{ color: '#c9922a' }}
              />
              <p className="text-xs text-center" style={{ color: '#78350f' }}>
                No tags yet. Drag on the PDF to create a tag.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: 'rgba(120,53,15,0.2)' }}>
              {links.map((link) => (
                <div
                  key={link.id}
                  className="px-4 py-3 flex items-start gap-3 group"
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-sm font-mono font-semibold truncate"
                      style={{ color: '#fde68a' }}
                    >
                      {link.link_id}
                    </p>
                    {link.label && (
                      <p
                        className="text-xs truncate mt-0.5"
                        style={{ color: '#c9922a' }}
                      >
                        {link.label}
                      </p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: '#78350f' }}>
                      Page {link.pdf_page}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(link.id)}
                    disabled={deletingId === link.id}
                    className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                    style={{ color: '#f87171' }}
                    title="Delete tag"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tag modal */}
      {pendingRegion && (
        <TagModal
          region={pendingRegion}
          existingLinkIds={existingLinkIds}
          noteContentLinkIds={noteContentLinkIds}
          onSave={handleSave}
          onClose={() => setPendingRegion(null)}
        />
      )}
    </div>
  )
}
