'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { NewsCard } from '@/actions/news'
import './gavelogy-reader.css'

interface Props {
  cards: NewsCard[]
  date: string
  sourcePaper: string
}

function formatDateDisplay(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Priority config ────────────────────────────────────────────────────────────
const PRIORITY_STRIPE: Record<string, string> = {
  HIGH:   '#991b1b',
  MEDIUM: '#c8920a',
  LOW:    '#71717a',
}
const PRIORITY_CHIP: Record<string, { bg: string; text: string }> = {
  HIGH:   { bg: '#991b1b', text: '#ffffff' },
  MEDIUM: { bg: '#92400e', text: '#fef9c3' },
  LOW:    { bg: '#3f3f46', text: '#e4e4e7' },
}

// ── Read-time helper ───────────────────────────────────────────────────────────
function estimateReadSeconds(card: NewsCard): number {
  if ((card as any).read_seconds) return (card as any).read_seconds
  const words = [
    card.capsule,
    ...(card.facts ?? []),
    ...(card.provisions ?? []).map((p: any) => `${p.provision} ${p.interpretation}`),
    ...(card.holdings ?? []).map((h: any) => h.text),
    card.doctrine?.name,
    card.topic,
  ].filter(Boolean).join(' ').split(/\s+/).length
  return Math.round((words / 180) * 60 / 5) * 5
}

// ── Card field builder ─────────────────────────────────────────────────────────
function buildFields(card: NewsCard) {
  const fields: { label: string; value: string }[] = []

  if (card.capsule) {
    fields.push({ label: 'In brief', value: card.capsule })
  }

  if (card.facts && card.facts.length > 0) {
    fields.push({ label: 'Background', value: card.facts.join(' ') })
  }

  const coreHolding = (card.holdings ?? []).find((h: any) => h.core)
  const otherRatios = (card.holdings ?? []).filter((h: any) => !h.core && h.type === 'ratio')
  if (coreHolding) {
    fields.push({ label: 'Core ruling', value: (coreHolding as any).text })
  } else if (otherRatios.length > 0) {
    fields.push({ label: 'Key holding', value: (otherRatios[0] as any).text })
  }

  if (card.doctrine?.name) {
    const parts = [card.doctrine.name]
    if (card.doctrine.lineage_chain) parts.push(card.doctrine.lineage_chain)
    fields.push({ label: 'Legal angle', value: parts.join(' · ') })
  }

  if (card.provisions && card.provisions.length > 0) {
    const pvText = (card.provisions as any[])
      .map((p: any) => p.provision)
      .join(' · ')
    fields.push({ label: 'Key provision', value: pvText })
  }

  return fields.slice(0, 5) // per spec: max 5 fields
}

// ── Progress bar ───────────────────────────────────────────────────────────────
function ProgressBar({ total, current }: { total: number; current: number }) {
  const segments = Math.max(total, 1)
  return (
    <div className="gr-progress">
      {Array.from({ length: segments }, (_, i) => (
        <div
          key={i}
          className={`gr-seg ${i < current ? 'gr-seg--done' : i === current ? 'gr-seg--active' : ''}`}
        />
      ))}
    </div>
  )
}

// ── Done screen ────────────────────────────────────────────────────────────────
function DoneScreen({ total, date, sourcePaper, onRestart }: {
  total: number; date: string; sourcePaper: string; onRestart: () => void
}) {
  const totalSec = total * 52 // avg 52 sec per card
  const totalMin = Math.ceil(totalSec / 60)
  return (
    <div className="gr-done">
      <div className="gr-done-ring">✓</div>
      <h2 className="gr-done-title">All caught up</h2>
      <p className="gr-done-sub">
        {total} legal news item{total !== 1 ? 's' : ''} from {sourcePaper}, {formatDateDisplay(date)}.
      </p>
      <div className="gr-done-stats">
        <div className="gr-done-stat">
          <span className="gr-done-stat-val">{total}</span>
          <span className="gr-done-stat-lbl">Articles read</span>
        </div>
        <div className="gr-done-stat">
          <span className="gr-done-stat-val gr-done-stat-val--dim">~{totalMin} min</span>
          <span className="gr-done-stat-lbl">Total time</span>
        </div>
      </div>
      <button className="gr-done-restart" onClick={onRestart}>Read again</button>
    </div>
  )
}

// ── Single card ────────────────────────────────────────────────────────────────
function GavelogyCard({ card }: { card: NewsCard }) {
  const priority = card.priority ?? 'LOW'
  const stripeColor = PRIORITY_STRIPE[priority] ?? '#71717a'
  const chip = PRIORITY_CHIP[priority] ?? PRIORITY_CHIP.LOW
  const pct = card.exam_probability?.replace('%', '') ?? ''
  const fields = buildFields(card)
  const readSec = estimateReadSeconds(card)
  const placement = card.topic ?? ''
  const sourceDisplay = [card.source_paper, formatDateDisplay(card.date)].filter(Boolean).join(' · ')
  const sourceUrl = (card as any).source_url as string | undefined

  return (
    <div className="gr-card">
      {/* Priority stripe */}
      <div className="gr-stripe" style={{ background: stripeColor }} />

      <div className="gr-inner">
        {/* Badge row */}
        <div className="gr-badges">
          <span className="gr-chip" style={{ background: chip.bg, color: chip.text }}>
            {priority}
          </span>
          {card.subject && (
            <span className="gr-chip" style={{ background: '#1e40af', color: '#ffffff' }}>
              {card.subject}
            </span>
          )}
          {card.court && (
            <span className="gr-chip" style={{ background: '#166534', color: '#ffffff' }}>
              {card.court.replace('Supreme Court of India', 'Supreme Court')
                         .replace('High Court — ', 'HC ')
                         .replace('Parliament — ', 'Parliament · ')}
            </span>
          )}
          {pct && (
            <span className="gr-exam-badge" style={{ marginLeft: 'auto' }}>
              {pct}% exam
            </span>
          )}
        </div>

        {/* Headline */}
        <h2 className="gr-headline">{card.title}</h2>

        {/* Source link */}
        {sourceUrl ? (
          <a href={sourceUrl} target="_blank" rel="noopener" className="gr-source">
            {sourceDisplay} ↗
          </a>
        ) : (
          <span className="gr-source gr-source--plain">{sourceDisplay}</span>
        )}

        <div className="gr-rule" />

        {/* Fields stack */}
        <div className="gr-fields">
          {fields.map((f, i) => (
            <div key={i} className="gr-field">
              <span className="gr-field-label">{f.label}</span>
              <span className="gr-field-value">{f.value}</span>
            </div>
          ))}
        </div>

        {/* Placement box */}
        {placement && (
          <div className="gr-placement">
            <p className="gr-placement-label">CLAT PG Placement</p>
            <p className="gr-placement-text">{placement}</p>
          </div>
        )}

        {/* Read time */}
        <div className="gr-readtime">
          <span className="gr-readtime-dot" />
          ~{readSec} sec read
        </div>
      </div>
    </div>
  )
}

// ── Main Reader ────────────────────────────────────────────────────────────────
export default function GavelogyReader({ cards, date, sourcePaper }: Props) {
  const [index, setIndex] = useState(0)
  const [done, setDone] = useState(false)
  const [animClass, setAnimClass] = useState('gr-card-in')
  const stageRef = useRef<HTMLDivElement>(null)
  const total = cards.length

  const navigate = useCallback((dir: 'prev' | 'next') => {
    if (dir === 'next' && index >= total - 1) {
      setDone(true)
      return
    }
    if (dir === 'prev' && index <= 0) return

    setAnimClass('gr-card-out')
    setTimeout(() => {
      setIndex(i => dir === 'next' ? i + 1 : i - 1)
      setAnimClass('gr-card-in')
      stageRef.current?.scrollTo({ top: 0 })
    }, 180)
  }, [index, total])

  const restart = useCallback(() => {
    setDone(false)
    setIndex(0)
    setAnimClass('gr-card-in')
  }, [])

  // Keyboard support
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); navigate('next') }
      if (e.key === 'ArrowLeft') { e.preventDefault(); navigate('prev') }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate])

  const currentCard = cards[index]

  if (total === 0) {
    return (
      <div className="gr-app">
        <div className="gr-topbar">
          <span className="gr-brand"><span className="gr-brand-main">Gavel</span><span className="gr-brand-ogy">ogy</span></span>
        </div>
        <div className="gr-empty">No published articles for this date.</div>
      </div>
    )
  }

  return (
    <div className="gr-app">
      {/* Topbar */}
      <div className="gr-topbar">
        <span className="gr-brand">
          <span className="gr-brand-main">Gavel</span>
          <span className="gr-brand-ogy">ogy</span>
        </span>
        <div className="gr-topbar-meta">
          <span className="gr-topbar-paper">{sourcePaper} · Delhi</span>
          <span className="gr-topbar-date">{formatDateDisplay(date)}</span>
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar total={total} current={done ? total : index} />

      {/* Stage */}
      <div className="gr-stage" ref={stageRef}>
        {done ? (
          <DoneScreen total={total} date={date} sourcePaper={sourcePaper} onRestart={restart} />
        ) : currentCard ? (
          <div className={animClass}>
            <GavelogyCard card={currentCard} />
          </div>
        ) : null}
      </div>

      {/* Navbar */}
      {!done && (
        <div className="gr-navbar">
          <button
            className="gr-btn gr-btn--prev"
            onClick={() => navigate('prev')}
            disabled={index === 0}
          >
            ← Prev
          </button>
          <span className="gr-counter">
            {index + 1} / {total}
          </span>
          <button
            className="gr-btn gr-btn--next"
            onClick={() => navigate('next')}
          >
            {index === total - 1 ? 'Done ✓' : 'Next →'}
          </button>
        </div>
      )}
    </div>
  )
}
