'use client'

import { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'

interface Region {
  page: number
  x: number
  y: number
  width: number
  height: number
}

interface TagModalProps {
  region: Region
  existingLinkIds: string[]
  noteContentLinkIds: string[]
  onSave: (linkId: string, label: string) => Promise<void>
  onClose: () => void
}

export default function TagModal({
  region,
  existingLinkIds,
  noteContentLinkIds,
  onSave,
  onClose,
}: TagModalProps) {
  const [linkId, setLinkId] = useState('')
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const isDuplicate = linkId.trim() !== '' && existingLinkIds.includes(linkId.trim())

  async function handleSave() {
    const trimmed = linkId.trim()
    if (!trimmed) {
      setError('Link ID is required')
      return
    }
    if (isDuplicate) {
      setError('This link ID already exists for this case')
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed, label.trim())
    } catch (err: any) {
      setError(err.message || 'Failed to save')
      setSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.75)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl border p-6 shadow-2xl"
        style={{
          background: '#150f04',
          borderColor: 'rgba(201,146,42,0.3)',
        }}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2
              className="text-lg font-bold"
              style={{ color: '#fef3c7' }}
            >
              Tag Region
            </h2>
            <p className="text-xs mt-1 font-mono" style={{ color: '#78350f' }}>
              Page {region.page} · ({Math.round(region.x)}, {Math.round(region.y)}) ·{' '}
              {Math.round(region.width)}×{Math.round(region.height)} PDF units
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: '#78350f' }}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Link ID */}
        <div className="mb-4">
          <label
            className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: '#c9922a' }}
          >
            Link ID <span style={{ color: '#f87171' }}>*</span>
          </label>
          <input
            type="text"
            value={linkId}
            onChange={(e) => {
              setLinkId(e.target.value)
              setError('')
            }}
            placeholder="e.g. link-ratio"
            className="w-full rounded-lg px-3 py-2 text-sm font-mono outline-none transition-colors"
            style={{
              background: 'rgba(201,146,42,0.08)',
              border: `1px solid ${isDuplicate ? '#f87171' : 'rgba(201,146,42,0.25)'}`,
              color: '#fde68a',
            }}
          />

          {/* Duplicate warning */}
          {isDuplicate && (
            <p className="flex items-center gap-1.5 text-xs mt-1.5" style={{ color: '#fca5a5' }}>
              <AlertTriangle className="w-3 h-3" />
              This link ID is already tagged for this case
            </p>
          )}

          {/* Suggestion chips */}
          {noteContentLinkIds.length > 0 && (
            <div className="mt-2">
              <p className="text-xs mb-1.5" style={{ color: '#78350f' }}>
                From note content:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {noteContentLinkIds.map((id) => {
                  const alreadyTagged = existingLinkIds.includes(id)
                  return (
                    <button
                      key={id}
                      onClick={() => {
                        setLinkId(id)
                        setError('')
                      }}
                      className="px-2 py-0.5 rounded-full text-xs font-mono transition-colors"
                      style={{
                        background: alreadyTagged
                          ? 'rgba(248,113,113,0.1)'
                          : 'rgba(201,146,42,0.15)',
                        color: alreadyTagged ? '#fca5a5' : '#c9922a',
                        border: `1px solid ${alreadyTagged ? 'rgba(248,113,113,0.3)' : 'rgba(201,146,42,0.3)'}`,
                        textDecoration: alreadyTagged ? 'line-through' : 'none',
                      }}
                    >
                      {id}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Label */}
        <div className="mb-5">
          <label
            className="block text-xs font-semibold uppercase tracking-wider mb-1.5"
            style={{ color: '#c9922a' }}
          >
            Label <span style={{ color: '#78350f' }}>(optional)</span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. ¶58 — Core Ratio"
            className="w-full rounded-lg px-3 py-2 text-sm outline-none transition-colors"
            style={{
              background: 'rgba(201,146,42,0.08)',
              border: '1px solid rgba(201,146,42,0.25)',
              color: '#fde68a',
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <p className="text-xs mb-4" style={{ color: '#f87171' }}>
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg text-sm font-medium transition-colors"
            style={{
              background: 'rgba(201,146,42,0.08)',
              color: '#78350f',
              border: '1px solid rgba(201,146,42,0.2)',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || isDuplicate}
            className="flex-1 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: '#c9922a', color: '#fff' }}
          >
            {saving ? 'Saving…' : 'Save Tag'}
          </button>
        </div>
      </div>
    </div>
  )
}
