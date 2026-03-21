'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, X, Globe, EyeOff, Trash2,
  CheckCircle2, Pencil, Check, BookOpen, ArrowLeft, LayoutList,
} from 'lucide-react'
import { toast } from 'sonner'
import { publishNewsCards, unpublishNewsCards, deleteNewsCard, updateNewsCard } from '@/actions/news'
import type { NewsCard } from '@/actions/news'
import { customToHtml } from '@/lib/content-converter'

interface Props {
  cards: NewsCard[]
  date: string
  sourcePaper?: string
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

const PRIORITY_CLASS: Record<string, string> = {
  HIGH:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  MEDIUM: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  LOW:    'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

// ── Sub-components ────────────────────────────────────────────────────────────

function McqPanel({ card, quizAnswers, setQuizAnswers }: {
  card: NewsCard
  quizAnswers: Record<string, string>
  setQuizAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>
}) {
  if (!card.mcqs || card.mcqs.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-sm text-muted-foreground">
        No MCQs for this article.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {card.mcqs.map((mcq, qi) => {
        const qKey = `${card.id}-${qi}`
        const selected = quizAnswers[qKey]
        const isCorrect = selected === mcq.answer
        return (
          <div key={qi} className="space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Q{qi + 1}</span>
              {mcq.difficulty && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${
                  mcq.difficulty === 'easy' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                  mcq.difficulty === 'medium' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                  'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                }`}>{mcq.difficulty}</span>
              )}
              {mcq.type && (
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {mcq.type === 'case_recall' ? 'Case Recall' : mcq.type === 'statement_evaluation' ? 'Statement Eval' : 'Application'}
                </span>
              )}
            </div>
            <p className="text-sm font-medium text-foreground leading-snug whitespace-pre-line">{mcq.question}</p>
            <div className="space-y-1.5">
              {mcq.options.map((opt, oi) => {
                const optLetter = opt.charAt(0)
                const isSelected = selected === optLetter
                const isAnswer = mcq.answer === optLetter
                return (
                  <button
                    key={oi}
                    disabled={!!selected}
                    onClick={() => setQuizAnswers(prev => ({ ...prev, [qKey]: optLetter }))}
                    className={`w-full text-left rounded-lg border px-3 py-2 text-xs leading-relaxed transition-all ${
                      !selected
                        ? 'hover:bg-primary/5 hover:border-primary/40 text-foreground'
                        : isAnswer
                          ? 'bg-green-50 dark:bg-green-950/30 border-green-400 text-green-800 dark:text-green-200 font-medium'
                          : isSelected
                            ? 'bg-red-50 dark:bg-red-950/30 border-red-400 text-red-800 dark:text-red-200'
                            : 'opacity-50 text-muted-foreground'
                    }`}
                  >
                    {opt}
                  </button>
                )
              })}
            </div>
            {selected && (
              <div className={`rounded-lg px-3 py-2.5 ${isCorrect
                ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/40'
                : 'bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40'
              }`}>
                <p className={`text-xs font-semibold mb-1 ${isCorrect ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                  {isCorrect ? '✓ Correct!' : `✗ Incorrect — Answer: ${mcq.answer}`}
                </p>
                <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{mcq.explanation}</p>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ArticleContent({ card }: { card: NewsCard }) {
  return (
    <div className="space-y-4">
      {/* Identity badges */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {card.priority && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${PRIORITY_CLASS[card.priority] || PRIORITY_CLASS.LOW}`}>
            {card.priority}
          </span>
        )}
        {card.exam_probability && (
          <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded border border-purple-200 dark:border-purple-800/40">
            {card.exam_probability} exam
          </span>
        )}
        {card.subject && <span className="text-[10px] text-muted-foreground">{card.subject}</span>}
        {card.topic && <span className="text-[10px] text-muted-foreground italic">· {card.topic}</span>}
        {card.court && <span className="text-[10px] text-muted-foreground">· {card.court}</span>}
      </div>

      {/* Capsule */}
      {card.capsule && (
        <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 px-4 py-3">
          <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1.5">💡 Capsule</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed italic">{card.capsule}</p>
        </div>
      )}

      {/* Facts */}
      {card.facts && card.facts.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Facts</p>
          <ol className="space-y-1.5 list-none">
            {card.facts.map((f, i) => (
              <li key={i} className="flex gap-2 text-xs text-gray-700 dark:text-gray-300 leading-relaxed">
                <span className="shrink-0 text-muted-foreground font-mono">[{i + 1}]</span>
                <span>{f}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Provisions */}
      {card.provisions && card.provisions.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Key Provisions</p>
          <div className="space-y-1.5">
            {card.provisions.map((p, i) => (
              <div key={i} className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                <p className="text-[11px] font-semibold text-foreground">{p.provision}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{p.interpretation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Holdings */}
      {card.holdings && card.holdings.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Holdings</p>
          <div className="space-y-1.5">
            {card.holdings.map((h, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2 ${
                h.core
                  ? 'border-green-200 dark:border-green-800/40 bg-green-50/60 dark:bg-green-950/20'
                  : 'border-amber-100 dark:border-amber-800/30 bg-amber-50/40 dark:bg-amber-950/10'
              }`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${
                    h.type === 'ratio'
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                      : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                  }`}>{h.label} {h.type === 'ratio' ? 'RATIO' : 'OBITER'}</span>
                  {h.core && <span className="text-[9px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wide">CORE</span>}
                </div>
                <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed">{h.text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Doctrine */}
      {card.doctrine && card.doctrine.name && (
        <div className="rounded-xl border border-purple-100 dark:border-purple-800/40 bg-purple-50/40 dark:bg-purple-950/20 px-4 py-3">
          <p className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-widest mb-1.5">⚖️ Doctrine</p>
          <p className="text-xs font-semibold text-foreground">{card.doctrine.name}</p>
          {card.doctrine.lineage_chain && (
            <p className="text-[11px] text-muted-foreground mt-1 italic">{card.doctrine.lineage_chain}</p>
          )}
        </div>
      )}

      {/* Fallback: summary */}
      {!card.capsule && !card.facts?.length && (
        <div className="rounded-xl border border-blue-100 dark:border-blue-900/40 bg-blue-50/60 dark:bg-blue-950/20 px-4 py-3">
          <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-widest mb-1.5">💡 Summary</p>
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">{card.summary || 'No summary available.'}</p>
        </div>
      )}

      {/* Keywords */}
      {card.keywords && card.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {card.keywords.map((kw, i) => (
            <span key={i} className="text-xs px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground border">{kw}</span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function NewsCarousel({ cards: initialCards, date, sourcePaper }: Props) {
  const router = useRouter()
  const topRef = useRef<HTMLDivElement>(null)

  const [cards, setCards] = useState(initialCards)
  const [mode, setMode] = useState<'overview' | 'reading'>('overview')
  const [index, setIndex] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({})
  const [actionLoading, setActionLoading] = useState(false)

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editSummary, setEditSummary] = useState('')

  const card = cards[index]
  const total = cards.length
  const formattedDate = formatDate(date)

  // ── Navigation ──────────────────────────────────────────────────────────────

  const goTo = useCallback((i: number) => {
    setIndex(i)
    setEditingId(null)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const prev = useCallback(() => goTo(Math.max(0, index - 1)), [index, goTo])
  const next = useCallback(() => goTo(Math.min(total - 1, index + 1)), [index, total, goTo])

  useEffect(() => {
    if (mode !== 'reading') return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') prev()
      if (e.key === 'ArrowRight') next()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, prev, next])

  function startReading(startIndex = 0) {
    setIndex(startIndex)
    setMode('reading')
    setTimeout(() => topRef.current?.scrollIntoView({ block: 'start' }), 50)
  }

  // ── Admin actions ───────────────────────────────────────────────────────────

  async function togglePublish() {
    if (!card) return
    setActionLoading(true)
    try {
      if (card.status === 'published') {
        await unpublishNewsCards([card.id!])
        toast.success('Moved to draft')
      } else {
        await publishNewsCards([card.id!])
        toast.success('Published')
      }
      setCards(prev => prev.map(c =>
        c.id === card.id ? { ...c, status: c.status === 'published' ? 'draft' : 'published' } : c
      ))
    } catch (e: any) { toast.error(e.message) }
    finally { setActionLoading(false) }
  }

  async function handleDelete() {
    if (!card || !confirm('Delete this article?')) return
    setActionLoading(true)
    try {
      await deleteNewsCard(card.id!)
      toast.success('Deleted')
      const newCards = cards.filter(c => c.id !== card.id)
      setCards(newCards)
      if (newCards.length === 0) router.push('/admin/news')
      else goTo(Math.min(index, newCards.length - 1))
    } catch (e: any) { toast.error(e.message) }
    finally { setActionLoading(false) }
  }

  function startEdit() {
    if (!card) return
    setEditTitle(card.title)
    setEditContent(card.content_custom || '')
    setEditSummary(card.summary || '')
    setEditingId(card.id!)
  }

  async function saveEdit() {
    if (!card) return
    setActionLoading(true)
    try {
      await updateNewsCard(card.id!, { title: editTitle, content_custom: editContent, summary: editSummary })
      setCards(prev => prev.map(c =>
        c.id === card.id
          ? { ...c, title: editTitle, content_custom: editContent, content_html: customToHtml(editContent), summary: editSummary }
          : c
      ))
      setEditingId(null)
      toast.success('Saved')
    } catch (e: any) { toast.error(e.message) }
    finally { setActionLoading(false) }
  }

  // ── Derived stats ───────────────────────────────────────────────────────────

  const highCount   = cards.filter(c => c.priority === 'HIGH').length
  const medCount    = cards.filter(c => c.priority === 'MEDIUM').length
  const totalMcqs   = cards.reduce((s, c) => s + (c.mcqs?.length || 0), 0)
  const subjects    = [...new Set(cards.map(c => c.subject || c.category).filter(Boolean))]

  // ── Overview screen ─────────────────────────────────────────────────────────

  if (mode === 'overview') {
    return (
      <div className="space-y-6">
        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'High Priority', value: highCount, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/20 border-red-100 dark:border-red-900/30' },
            { label: 'Medium Priority', value: medCount, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30' },
            { label: 'Subjects', value: subjects.length, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-50 dark:bg-blue-950/20 border-blue-100 dark:border-blue-900/30' },
            { label: 'Total MCQs', value: totalMcqs, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-50 dark:bg-purple-950/20 border-purple-100 dark:border-purple-900/30' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.bg}`}>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Source info */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="text-base">📰</span>
          <span>{sourcePaper || cards[0]?.source_paper || 'Newspaper'}</span>
          <span>·</span>
          <span>{formattedDate}</span>
        </div>

        {/* Article index list */}
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-5 py-3 border-b bg-muted/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LayoutList className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-semibold">Articles ({total})</span>
            </div>
          </div>
          <div className="divide-y">
            {cards.map((c, i) => (
              <button
                key={c.id || i}
                onClick={() => startReading(i)}
                className="w-full text-left px-5 py-3.5 hover:bg-muted/40 transition-colors group"
              >
                <div className="flex items-start gap-3">
                  <span className="text-sm font-mono text-muted-foreground shrink-0 mt-0.5 w-5">{i + 1}.</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {c.priority && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${PRIORITY_CLASS[c.priority] || PRIORITY_CLASS.LOW}`}>
                          {c.priority}
                        </span>
                      )}
                      {c.exam_probability && (
                        <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-400">
                          {c.exam_probability} exam
                        </span>
                      )}
                      {c.subject && (
                        <span className="text-[10px] text-muted-foreground">{c.subject}</span>
                      )}
                      {c.status === 'published' && (
                        <span className="flex items-center gap-0.5 text-[10px] text-green-600 dark:text-green-400 font-medium ml-auto">
                          <CheckCircle2 className="w-3 h-3" /> Live
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                      {c.title}
                    </p>
                    {c.capsule && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic">{c.capsule}</p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Start Reading CTA */}
        <button
          onClick={() => startReading(0)}
          className="w-full h-12 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
        >
          <BookOpen className="w-4 h-4" />
          Start Reading — Article 1 of {total}
        </button>
      </div>
    )
  }

  // ── Reading screen ──────────────────────────────────────────────────────────

  if (!card) return null

  return (
    <div ref={topRef} className="space-y-4">

      {/* ── Top bar ── */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setMode('overview')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Overview</span>
        </button>

        <div className="w-px h-4 bg-border" />

        {/* Article dots */}
        <div className="flex gap-1.5 flex-wrap flex-1 justify-center">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              title={`Article ${i + 1}`}
              className={`rounded-full transition-all ${i === index ? 'w-5 h-2 bg-primary' : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/60'}`}
            />
          ))}
        </div>

        {/* Progress */}
        <span className="text-xs font-medium text-muted-foreground shrink-0">{index + 1} / {total}</span>

        <div className="w-px h-4 bg-border" />

        {/* Admin actions */}
        <div className="flex items-center gap-1 shrink-0">
          {editingId === card.id ? (
            <>
              <button onClick={saveEdit} disabled={actionLoading} className="flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-medium text-green-600 border border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-950/30 disabled:opacity-50">
                <Check className="w-3 h-3" /> Save
              </button>
              <button onClick={() => setEditingId(null)} className="h-7 w-7 flex items-center justify-center rounded-md border text-muted-foreground hover:text-foreground">
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button onClick={startEdit} disabled={actionLoading} className="flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium text-muted-foreground border hover:border-foreground/30 hover:text-foreground disabled:opacity-50">
                <Pencil className="w-3 h-3" />
                <span className="hidden sm:inline">Edit</span>
              </button>
              <button onClick={togglePublish} disabled={actionLoading} className={`flex items-center gap-1 h-7 px-2 rounded-md text-xs font-medium border disabled:opacity-50 ${
                card.status === 'published'
                  ? 'text-amber-600 border-amber-300 dark:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/30'
                  : 'text-green-600 border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-green-950/30'
              }`}>
                {card.status === 'published' ? <EyeOff className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                <span className="hidden sm:inline">{card.status === 'published' ? 'Unpublish' : 'Publish'}</span>
              </button>
              <button onClick={handleDelete} disabled={actionLoading} className="h-7 w-7 flex items-center justify-center rounded-md border text-muted-foreground hover:text-red-500 hover:border-red-200 disabled:opacity-50">
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Card ── */}
      <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">

        {/* Title header */}
        <div className="px-5 py-4 border-b bg-muted/20">
          {editingId === card.id ? (
            <input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              className="w-full text-base font-bold bg-transparent border-b border-primary focus:outline-none pb-1"
              autoFocus
            />
          ) : (
            <h2 className="text-base font-bold leading-snug">{card.title}</h2>
          )}
          <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
            <span>📰 {sourcePaper || card.source_paper}</span>
            <span>·</span>
            <span>{formattedDate}</span>
            {card.status === 'published' && (
              <span className="flex items-center gap-0.5 text-green-600 dark:text-green-400 font-medium ml-2">
                <CheckCircle2 className="w-3 h-3" /> Live
              </span>
            )}
          </div>
        </div>

        {/* Edit mode full-width form */}
        {editingId === card.id && (
          <div className="px-5 py-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Content (custom tags)</p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <textarea
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  rows={12}
                  className="w-full rounded-lg border bg-background text-xs font-mono p-3 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
                  spellCheck={false}
                />
                <div
                  className="rounded-lg border p-3 bg-[#fefdf5] dark:bg-amber-950/10 text-sm prose prose-sm max-w-none news-content min-h-[200px]"
                  dangerouslySetInnerHTML={{ __html: customToHtml(editContent) }}
                />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Summary / Capsule</p>
              <textarea
                value={editSummary}
                onChange={e => setEditSummary(e.target.value)}
                rows={3}
                className="w-full rounded-lg border bg-background text-sm p-3 focus:outline-none focus:ring-2 focus:ring-primary/50 resize-y"
              />
            </div>
          </div>
        )}

        {/* ── Split view — desktop: side-by-side, mobile: stacked ── */}
        {editingId !== card.id && (
          <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x">

            {/* LEFT / TOP — article study content */}
            <div className="p-5 overflow-y-auto lg:max-h-[70vh]">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">Study Note</p>
              <ArticleContent card={card} />
            </div>

            {/* Divider on mobile */}
            <div className="lg:hidden border-t border-dashed" />

            {/* RIGHT / BOTTOM — MCQs */}
            <div className="p-5 overflow-y-auto lg:max-h-[70vh]">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest mb-3">
                📝 Practice MCQs · CLAT PG 2027
              </p>
              <McqPanel card={card} quizAnswers={quizAnswers} setQuizAnswers={setQuizAnswers} />
            </div>
          </div>
        )}
      </div>

      {/* ── Prev / Next navigation ── */}
      <div className="flex items-center gap-3">
        <button
          onClick={prev}
          disabled={index === 0}
          className="flex items-center gap-1.5 h-11 px-4 rounded-xl border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Prev
        </button>

        <div className="flex-1 flex justify-center gap-1.5 flex-wrap">
          {cards.map((_, i) => (
            <button
              key={i}
              onClick={() => goTo(i)}
              className={`rounded-full transition-all ${i === index ? 'w-5 h-2 bg-primary' : 'w-2 h-2 bg-muted-foreground/30 hover:bg-muted-foreground/60'}`}
            />
          ))}
        </div>

        {index < total - 1 ? (
          <button
            onClick={next}
            className="flex items-center gap-1.5 h-11 px-5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-opacity"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={() => setMode('overview')}
            className="flex items-center gap-1.5 h-11 px-5 rounded-xl bg-green-600 text-white text-sm font-bold hover:opacity-90 transition-opacity"
          >
            <CheckCircle2 className="w-4 h-4" />
            Done
          </button>
        )}
      </div>
    </div>
  )
}
