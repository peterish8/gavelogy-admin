'use client'

import { useState, useRef } from 'react'
import Link from 'next/link'
import type { CaseItem } from '@/actions/judgment/links'
import { createClient } from '@/lib/supabase/client'
import {
  CheckCircle2,
  XCircle,
  Tag,
  Loader2,
  Gavel,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'

interface Props {
  cases: CaseItem[]
  linkCounts: Record<string, number>
}

export default function TagCasesClient({ cases, linkCounts }: Props) {
  const [localPdfUrls, setLocalPdfUrls] = useState<Record<string, string>>({})
  const [uploadingId, setUploadingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const supabase = createClient()

  async function handlePdfUpload(caseId: string, file: File) {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('caseId', caseId)

    const { data: { session } } = await supabase.auth.getSession()

    const res = await fetch('/api/judgment/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}` },
      body: formData,
    })
    const result = await res.json()
    if (!result.success) throw new Error(result.error)

    setLocalPdfUrls(prev => ({ ...prev, [caseId]: result.objectKey }))
  }

  async function handleFileChange(caseId: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingId(caseId)
    try {
      await handlePdfUpload(caseId, file)
      toast.success('PDF uploaded successfully')
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`)
    } finally {
      setUploadingId(false as any)
      setUploadingId(null)
      // Reset input
      const input = fileInputRefs.current.get(caseId)
      if (input) input.value = ''
    }
  }

  const filtered = cases.filter(c =>
    c.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="min-h-full" style={{ background: '#0f0e0b', minHeight: '100vh' }}>
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(201,146,42,0.15)' }}
          >
            <Gavel className="w-5 h-5" style={{ color: '#c9922a' }} />
          </div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#fef3c7' }}>
            Tag Cases
          </h1>
        </div>
        <p className="text-sm" style={{ color: '#92400e', marginLeft: '52px' }}>
          Upload a PDF to Backblaze B2 then drag-tag regions
        </p>
      </div>

      {/* Search */}
      <div className="mb-5">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search cases…"
          className="w-full max-w-sm rounded-lg px-3 py-2 text-sm outline-none"
          style={{
            background: 'rgba(201,146,42,0.08)',
            border: '1px solid rgba(201,146,42,0.25)',
            color: '#fde68a',
          }}
        />
      </div>

      {/* Table */}
      <div
        className="rounded-xl border overflow-hidden"
        style={{ borderColor: 'rgba(120,53,15,0.3)', background: 'rgba(20,15,5,0.8)' }}
      >
        {/* Table header */}
        <div
          className="grid grid-cols-[1fr_130px_90px_160px_110px] gap-4 px-5 py-3 text-xs font-semibold uppercase tracking-widest border-b"
          style={{
            color: '#92400e',
            borderColor: 'rgba(120,53,15,0.3)',
            background: 'rgba(201,146,42,0.05)',
          }}
        >
          <span>Case</span>
          <span>PDF Status</span>
          <span>Links</span>
          <span>Upload PDF</span>
          <span>Actions</span>
        </div>

        {filtered.length === 0 ? (
          <div className="py-20 text-center" style={{ color: '#78350f' }}>
            {cases.length === 0
              ? 'No case items found (titles starting with CS-, CQ-, or CR-)'
              : 'No cases match your search'}
          </div>
        ) : (
          filtered.map((c, i) => {
            const pdfUrl = localPdfUrls[c.id] ?? c.pdf_url
            const count = linkCounts[c.id] || 0
            const isUploading = uploadingId === c.id

            return (
              <div
                key={c.id}
                className="grid grid-cols-[1fr_130px_90px_160px_110px] gap-4 px-5 py-4 items-center border-b transition-colors"
                style={{
                  borderColor: 'rgba(120,53,15,0.2)',
                  background: i % 2 === 0 ? 'transparent' : 'rgba(201,146,42,0.02)',
                }}
              >
                {/* Title */}
                <span className="font-mono font-semibold text-sm" style={{ color: '#fde68a' }}>
                  {c.title}
                </span>

                {/* PDF Status */}
                {pdfUrl ? (
                  <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: '#4ade80' }}>
                    <CheckCircle2 className="w-4 h-4" />
                    PDF ✓
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm" style={{ color: '#78350f' }}>
                    <XCircle className="w-4 h-4" />
                    No PDF
                  </span>
                )}

                {/* Link count */}
                <span
                  className="text-sm font-mono"
                  style={{ color: count > 0 ? '#c9922a' : '#78350f' }}
                >
                  {count} {count === 1 ? 'link' : 'links'}
                </span>

                {/* Upload */}
                <div>
                  <input
                    ref={el => { if (el) fileInputRefs.current.set(c.id, el) }}
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={e => handleFileChange(c.id, e)}
                  />
                  <button
                    onClick={() => fileInputRefs.current.get(c.id)?.click()}
                    disabled={isUploading}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-60"
                    style={{
                      background: 'rgba(201,146,42,0.12)',
                      border: '1px solid rgba(201,146,42,0.3)',
                      color: '#c9922a',
                    }}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Uploading…
                      </>
                    ) : (
                      <>
                        <Upload className="w-3.5 h-3.5" />
                        {pdfUrl ? 'Replace PDF' : 'Upload PDF'}
                      </>
                    )}
                  </button>
                </div>

                {/* Tag button */}
                <div>
                  {pdfUrl ? (
                    <Link
                      href={`/admin/tag/${c.id}`}
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                      style={{ background: '#c9922a', color: '#fff' }}
                    >
                      <Tag className="w-3.5 h-3.5" />
                      Tag →
                    </Link>
                  ) : (
                    <button
                      disabled
                      className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium opacity-30 cursor-not-allowed"
                      style={{
                        background: 'rgba(201,146,42,0.1)',
                        color: '#c9922a',
                        border: '1px solid rgba(201,146,42,0.2)',
                      }}
                    >
                      <Tag className="w-3.5 h-3.5" />
                      Tag →
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
