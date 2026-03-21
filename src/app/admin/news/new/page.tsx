'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Loader2, Newspaper, Trash2, Pencil, Check, X, ChevronLeft, ChevronRight, Globe, FileText, Sparkles, Search } from 'lucide-react'
import { toast } from 'sonner'
import { customToHtml } from '@/lib/content-converter'
import { saveNewsCards } from '@/actions/news'

// ─── Types ──────────────────────────────────────────────────────────────────

interface McqItem {
  type: 'case_recall' | 'statement_evaluation' | 'application'
  difficulty: 'easy' | 'medium' | 'hard'
  question: string
  options: string[]
  answer: string
  explanation: string
  holding_ref: string
}

interface Provision {
  provision: string
  interpretation: string
}

interface Holding {
  label: string
  type: 'ratio' | 'obiter'
  core: boolean
  text: string
}

interface Doctrine {
  name: string
  status: string
  overruled: string
  distinguished_from: string
  relied_upon: string[]
  lineage_chain: string
}

interface ArticleCard {
  title: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  subject: string
  topic: string
  court: string
  keywords: string[]
  capsule: string
  facts: string[]
  provisions: Provision[]
  holdings: Holding[]
  doctrine: Doctrine
  mcqs: McqItem[]
  exam_rank: number
  exam_probability: string
  exam_probability_reason: string
  // Legacy — kept for edit mode
  content: string
  summary: string
  category: string
  previewImage: string  // highlighted PDF clipping — admin verify only, NOT saved
  tempId: string
  isDirty: boolean
  isEditing: boolean
  editDraft: string
}

type Step = 'input' | 'extracting' | 'generating' | 'review' | 'saving'

// ─── Constants ───────────────────────────────────────────────────────────────

const CATEGORY_COLORS: Record<string, string> = {
  'Constitutional Law': 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Criminal Law':       'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'Civil Law':          'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  'Family Law':         'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  'Environmental Law':  'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Labour Law':         'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Tax Law':            'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  'Corporate Law':      'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Tribunal':           'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'Legislation':        'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  'Appointments':       'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'Other':              'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
}

// ─── PDF helpers ─────────────────────────────────────────────────────────────

// Holds the loaded pdf object so we can re-render pages with highlights after AI returns
let _pdfCache: { pdf: any } | null = null

async function extractFromPdf(file: File): Promise<{ fullText: string; pageTexts: string[] }> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise
  _pdfCache = { pdf }

  const pageTexts: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pageTexts.push(
      (content.items as any[]).filter(it => 'str' in it).map((it: any) => it.str).join(' ')
    )
  }
  return { fullText: pageTexts.join('\n\n'), pageTexts }
}

// Find which 0-indexed page most likely contains the article
function findPageIndex(title: string, pageTexts: string[]): number {
  const words = title.toLowerCase().replace(/[^a-z0-9 ]/g, '').split(' ').filter(w => w.length > 4)
  if (words.length === 0) return 0
  let bestPage = 0, bestScore = 0
  for (let i = 0; i < pageTexts.length; i++) {
    const pt = pageTexts[i].toLowerCase()
    const score = words.filter(w => pt.includes(w)).length
    if (score > bestScore) { bestScore = score; bestPage = i }
  }
  return bestPage
}

// Render a PDF page to canvas with yellow (title) + cyan (keyword) highlights
async function renderHighlightedPage(
  pageNum: number,
  titleWords: string[],
  keywords: string[]
): Promise<string> {
  if (!_pdfCache) return ''
  const page = await _pdfCache.pdf.getPage(pageNum)
  const viewport = page.getViewport({ scale: 0.7 })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')!

  await page.render({ canvasContext: ctx, viewport }).promise

  const content = await page.getTextContent()
  for (const item of (content.items as any[])) {
    if (!('str' in item) || !item.str?.trim()) continue
    const str = item.str.toLowerCase()

    const isTitleMatch = titleWords.some(w => str.includes(w))
    const isKeywordMatch = keywords.some(k =>
      k.toLowerCase().split(/\s+/).some(kw => kw.length > 3 && str.includes(kw))
    )
    if (!isTitleMatch && !isKeywordMatch) continue

    const x = item.transform[4] * viewport.scale
    const y = viewport.height - item.transform[5] * viewport.scale
    const w = (item.width ?? 40) * viewport.scale
    const h = (item.height ?? 10) * viewport.scale

    ctx.fillStyle = isTitleMatch
      ? 'rgba(255, 240, 50, 0.55)'   // yellow — title words
      : 'rgba(150, 225, 255, 0.55)'  // cyan   — keywords
    ctx.fillRect(x, y - h, w + 1, h * 1.15)
  }

  return canvas.toDataURL('image/jpeg', 0.7)
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ProcessNewspaperPage() {
  const router = useRouter()

  // Input state
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState<string>(today)
  const [sourcePaper, setSourcePaper] = useState<string>('The Hindu')
  const [maxArticles, setMaxArticles] = useState<number>(8)
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Pipeline state
  const [step, setStep] = useState<Step>('input')
  const [cards, setCards] = useState<ArticleCard[]>([])
  const [provider, setProvider] = useState<string>('')
  const [error, setError] = useState<string | null>(null)
  const [reviewIndex, setReviewIndex] = useState(0)
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({})  // key: `${tempId}-${qi}`
  const [clippingId, setClippingId] = useState<string | null>(null)
  const [openCards, setOpenCards] = useState<Set<string>>(new Set())
  const [filterType, setFilterType] = useState<string>('all')
  const [selectedModel, setSelectedModel] = useState<string>('auto')

  // ── File handling ──────────────────────────────────────────────────────────

  function handleFile(file: File) {
    if (!file.name.endsWith('.pdf')) {
      toast.error('Please upload a PDF file')
      return
    }
    setPdfFile(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [])

  // ── Main extraction handler ────────────────────────────────────────────────

  async function handleExtract() {
    if (!pdfFile) { toast.error('Please upload a newspaper PDF'); return }
    if (!date) { toast.error('Please select the newspaper date'); return }
    if (!sourcePaper.trim()) { toast.error('Please enter the newspaper name'); return }

    setError(null)
    setStep('extracting')

    try {
      const { fullText, pageTexts } = await extractFromPdf(pdfFile)
      if (!fullText.trim()) throw new Error('No text could be extracted from this PDF')

      setStep('generating')

      const res = await fetch('/api/ai-news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfText: fullText,
          date,
          sourcePaper,
          maxArticles,
          preferredModel: selectedModel === 'auto' ? undefined : selectedModel,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'AI extraction failed')
      if (!data.articles || data.articles.length === 0) {
        throw new Error('No law-related articles found in this newspaper. Try a different PDF or increase the article count.')
      }

      setProvider(data.provider)

      // Render each article's page with highlights (title=yellow, keywords=cyan)
      const mappedCards = await Promise.all(data.articles.map(async (a: any) => {
        const keywords = Array.isArray(a.keywords) ? a.keywords : []
        const pageIdx = findPageIndex(a.title || '', pageTexts)
        const titleWords = (a.title || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3)
        const previewImage = await renderHighlightedPage(pageIdx + 1, titleWords, keywords)
        return {
          title: a.title || '',
          priority: (a.priority || 'MEDIUM') as 'HIGH' | 'MEDIUM' | 'LOW',
          subject: a.subject || a.category || 'Other',
          topic: a.topic || '',
          court: a.court || '',
          keywords,
          capsule: a.capsule || a.summary || '',
          facts: Array.isArray(a.facts) ? a.facts : [],
          provisions: Array.isArray(a.provisions) ? a.provisions : [],
          holdings: Array.isArray(a.holdings) ? a.holdings : [],
          doctrine: a.doctrine || { name: '', status: '', overruled: 'None', distinguished_from: 'None', relied_upon: [], lineage_chain: '' },
          mcqs: Array.isArray(a.mcqs) ? a.mcqs : [],
          exam_rank: a.exam_rank || 99,
          exam_probability: a.exam_probability || '',
          exam_probability_reason: a.exam_probability_reason || '',
          // Legacy fields
          content: '',
          summary: a.capsule || a.summary || '',
          category: a.subject || a.category || 'Other',
          previewImage,
          tempId: crypto.randomUUID(),
          isDirty: false,
          isEditing: false,
          editDraft: '',
        }
      }))

      setCards(mappedCards)
      setStep('review')

    } catch (e: any) {
      setError(e.message)
      setStep('input')
      toast.error(e.message)
    }
  }

  // ── Card operations ────────────────────────────────────────────────────────

  function startEdit(tempId: string) {
    setCards(prev => prev.map(c =>
      c.tempId === tempId ? { ...c, isEditing: true, editDraft: c.content } : c
    ))
  }

  function saveEdit(tempId: string) {
    setCards(prev => prev.map(c =>
      c.tempId === tempId ? { ...c, isEditing: false, content: c.editDraft, isDirty: true } : c
    ))
  }

  function cancelEdit(tempId: string) {
    setCards(prev => prev.map(c =>
      c.tempId === tempId ? { ...c, isEditing: false } : c
    ))
  }

  function deleteCard(tempId: string) {
    setCards(prev => prev.filter(c => c.tempId !== tempId))
  }

  function updateEditDraft(tempId: string, value: string) {
    setCards(prev => prev.map(c =>
      c.tempId === tempId ? { ...c, editDraft: value } : c
    ))
  }

  // ── Save handler ───────────────────────────────────────────────────────────

  async function handleSave(publish: boolean) {
    if (cards.length === 0) return
    setStep('saving')

    try {
      const payload = cards.map(card => ({
        date,
        title: card.title,
        content_custom: card.content || '',
        summary: card.capsule || card.summary,
        keywords: card.keywords,
        category: card.category,
        source_paper: sourcePaper,
        // New 7-field structure
        subject: card.subject,
        topic: card.topic,
        court: card.court,
        priority: card.priority,
        exam_probability: card.exam_probability,
        capsule: card.capsule,
        facts: card.facts.length > 0 ? card.facts : undefined,
        provisions: card.provisions.length > 0 ? card.provisions : undefined,
        holdings: card.holdings.length > 0 ? card.holdings : undefined,
        doctrine: card.doctrine?.name ? card.doctrine : undefined,
        mcqs: card.mcqs.length > 0 ? card.mcqs : undefined,
      }))

      await saveNewsCards(payload, publish ? 'published' : 'draft')
      toast.success(publish
        ? `${cards.length} article${cards.length > 1 ? 's' : ''} published!`
        : `${cards.length} article${cards.length > 1 ? 's' : ''} saved as draft`
      )
      router.push('/admin/news')
    } catch (e: any) {
      toast.error('Save failed: ' + e.message)
      setStep('review')
    }
  }

  // ── REVIEW SCREEN ─────────────────────────────────────────────────────────
  if (step === 'review' || step === 'saving') {
    const npDateStr = new Date(date + 'T00:00:00').toLocaleDateString('en-IN', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    })
    const highCount  = cards.filter(c => c.priority === 'HIGH').length
    const medCount   = cards.filter(c => c.priority === 'MEDIUM').length
    const totalMcqs  = cards.reduce((sum, c) => sum + (c.mcqs?.length || 0), 0)
    const subjects   = [...new Set(cards.map(c => c.subject || c.category).filter(Boolean))]
    const visibleCards = filterType === 'all'
      ? cards
      : filterType === 'high'   ? cards.filter(c => c.priority === 'HIGH')
      : filterType === 'medium' ? cards.filter(c => c.priority === 'MEDIUM')
      : cards.filter(c => (c.subject || c.category) === filterType)

    const mono  = "'DM Mono', monospace"
    const serif = "'Playfair Display', serif"
    const lora  = "'Lora', Georgia, serif"
    const ink = '#1c1917', ink2 = '#44403c', ink3 = '#78716c'
    const paper = '#faf7f2', cream = '#f0ebe1', rule = '#e2ddd6'
    const high = '#b91c1c', navy = '#1e3a5f', navy2 = '#2563a0', gold = '#c8920a', sage = '#166534'

    const toggleCard = (tempId: string) => setOpenCards(prev => {
      const s = new Set(prev); s.has(tempId) ? s.delete(tempId) : s.add(tempId); return s
    })

    const SectionLabel = ({ children }: { children: React.ReactNode }) => (
      <div style={{ fontFamily: mono, fontSize: 9, color: ink3, textTransform: 'uppercase' as const, letterSpacing: 2, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
        {children}
        <div style={{ flex: 1, height: 1, background: rule }} />
      </div>
    )

    return (
      <div style={{ minHeight: '100vh', background: paper, color: ink, fontFamily: lora, lineHeight: 1.65 }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400&family=DM+Mono:wght@400;500&family=Lora:ital,wght@0,400;0,500;1,400&display=swap'); @keyframes spin { to { transform: rotate(360deg) } }`}</style>

        {/* Saving overlay */}
        {step === 'saving' && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(30,58,95,0.93)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <div style={{ width: 40, height: 40, border: `3px solid ${gold}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontFamily: mono, fontSize: 12, color: gold, textTransform: 'uppercase', letterSpacing: 2 }}>Saving articles...</p>
          </div>
        )}

        {/* ── MASTHEAD ── */}
        <header style={{ background: navy, padding: '0 24px', position: 'sticky', top: 0, zIndex: 100, borderBottom: `3px solid ${gold}` }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontFamily: serif, fontSize: 22, fontWeight: 700, color: '#fff', letterSpacing: 2 }}>GAVEL</span>
              <span style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, fontStyle: 'italic', color: gold }}>ogy</span>
              <span style={{ fontFamily: mono, fontSize: 9, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 2, marginLeft: 12, alignSelf: 'center' }}>CLAT PG 2027 · Admin Review</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {provider && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(200,146,10,0.15)', border: `1px solid rgba(200,146,10,0.4)`, borderRadius: 4, padding: '5px 10px' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ade80', display: 'inline-block', flexShrink: 0, boxShadow: '0 0 6px #4ade80' }} />
                  <span style={{ fontFamily: mono, fontSize: 10, color: gold, fontWeight: 700, letterSpacing: 0.5 }}>{provider}</span>
                </div>
              )}
              <div style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,0.45)', textAlign: 'right', lineHeight: 1.5 }}>
                <strong style={{ color: 'rgba(255,255,255,0.75)', fontWeight: 500 }}>{sourcePaper}</strong><br />
                {npDateStr}
              </div>
            </div>
          </div>
        </header>

        {/* ── FILTER STRIP ── */}
        <div style={{ background: paper, borderBottom: `1px solid ${rule}`, padding: '12px 24px', position: 'sticky', top: 58, zIndex: 90 }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: mono, fontSize: 9, color: ink3, textTransform: 'uppercase', letterSpacing: 1.5, marginRight: 4 }}>Filter</span>
            {([
              { key: 'all',    label: `All ${cards.length}` },
              { key: 'high',   label: 'High Priority' },
              { key: 'medium', label: 'Medium' },
              ...subjects.map(s => ({ key: s, label: s })),
            ] as { key: string; label: string }[]).map(f => (
              <button key={f.key} onClick={() => setFilterType(f.key)} style={{
                fontFamily: mono, fontSize: 10, padding: '5px 12px', borderRadius: 2,
                border: `1px solid ${filterType === f.key ? navy : rule}`,
                color: filterType === f.key ? gold : ink3,
                background: filterType === f.key ? navy : 'transparent',
                cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 500, transition: 'all .15s',
              }}>
                {f.label}
              </button>
            ))}
            <button onClick={() => { setStep('input'); setCards([]) }} style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 9, color: ink3, background: 'none', border: 'none', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>
              ← Start over
            </button>
          </div>
        </div>

        {/* ── DATE BAR ── */}
        <div style={{ background: cream, borderBottom: `1px solid ${rule}`, padding: '10px 24px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: ink3, textTransform: 'uppercase', letterSpacing: 1 }}>
              <strong style={{ color: ink2, fontWeight: 500 }}>{npDateStr}</strong>{provider ? ` · via ${provider}` : ''} · {sourcePaper}
            </div>
            <div style={{ fontFamily: mono, fontSize: 11, color: high, fontWeight: 500 }}>
              {cards.length} article{cards.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* ── MAIN ── */}
        <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>

          {/* Stats bar */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
            {[
              { n: highCount,       l: 'High Priority',  c: high  },
              { n: medCount,        l: 'Medium Priority', c: gold  },
              { n: subjects.length, l: 'Subjects',        c: navy  },
              { n: totalMcqs,       l: 'MCQs Total',      c: navy  },
            ].map(s => (
              <div key={s.l} style={{ background: '#fff', border: `1px solid ${rule}`, borderRadius: 4, padding: '14px 16px', textAlign: 'center' }}>
                <div style={{ fontFamily: serif, fontSize: 28, fontWeight: 600, color: s.c, lineHeight: 1, marginBottom: 4 }}>{s.n}</div>
                <div style={{ fontFamily: mono, fontSize: 9, color: ink3, textTransform: 'uppercase', letterSpacing: 1 }}>{s.l}</div>
              </div>
            ))}
          </div>

          {/* Section heading rule */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div style={{ height: 2, background: rule, flex: 1 }} />
            <div style={{ fontFamily: mono, fontSize: 10, color: ink3, textTransform: 'uppercase', letterSpacing: 2, whiteSpace: 'nowrap' }}>
              Legal News · {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            </div>
            <div style={{ height: 2, background: rule, flex: 1 }} />
          </div>

          {cards.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: ink3 }}>
              <p style={{ fontFamily: mono, fontSize: 13 }}>All articles deleted.{' '}
                <button onClick={() => { setStep('input'); setCards([]) }} style={{ color: navy2, cursor: 'pointer', background: 'none', border: 'none', textDecoration: 'underline', fontFamily: mono, fontSize: 13 }}>Start over</button>
              </p>
            </div>
          )}

          {/* ── NEWS STACK ── */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {visibleCards.map((card, idx) => {
              const isOpen  = openCards.has(card.tempId)
              const isFirst = idx === 0
              const isLast  = idx === visibleCards.length - 1
              const priColor = card.priority === 'HIGH' ? high : card.priority === 'MEDIUM' ? gold : ink3

              return (
                <article key={card.tempId} style={{
                  background: '#fff',
                  border: `1px solid ${rule}`,
                  borderTop: isFirst ? `1px solid ${rule}` : 'none',
                  borderRadius: isFirst ? '4px 4px 0 0' : isLast ? '0 0 4px 4px' : 0,
                  overflow: 'hidden',
                }}>
                  {/* Priority stripe */}
                  <div style={{ height: 3, background: priColor }} />

                  {/* Card body */}
                  <div style={{ padding: '20px 24px' }}>

                    {/* Badges row */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 12 }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 }}>
                        <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 500, padding: '3px 8px', borderRadius: 2, textTransform: 'uppercase', letterSpacing: 0.5, background: card.priority === 'HIGH' ? '#fef2f2' : '#fffbeb', color: card.priority === 'HIGH' ? high : '#92400e', border: `1px solid ${card.priority === 'HIGH' ? '#fecaca' : '#fde68a'}` }}>
                          {card.priority} Priority
                        </span>
                        <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 500, padding: '3px 8px', borderRadius: 2, textTransform: 'uppercase', letterSpacing: 0.5, background: '#eff6ff', color: navy2, border: '1px solid #bfdbfe' }}>
                          {card.subject || card.category}
                        </span>
                        {card.court && (
                          <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 500, padding: '3px 8px', borderRadius: 2, textTransform: 'uppercase', letterSpacing: 0.5, background: '#f0fdf4', color: sage, border: '1px solid #bbf7d0' }}>
                            {card.court}
                          </span>
                        )}
                      </div>
                      {card.exam_probability && (
                        <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 2, textTransform: 'uppercase', letterSpacing: 0.5, background: navy, color: gold, border: `1px solid ${navy}`, whiteSpace: 'nowrap', flexShrink: 0 }}>
                          {card.exam_probability}
                        </span>
                      )}
                    </div>

                    {/* Headline */}
                    <h2 onClick={() => toggleCard(card.tempId)} style={{ fontFamily: serif, fontSize: 20, fontWeight: 600, color: ink, lineHeight: 1.3, marginBottom: 10, cursor: 'pointer' }}>
                      {card.title}
                    </h2>

                    {/* Capsule */}
                    {card.capsule && (
                      <p style={{ fontFamily: lora, fontSize: 13, color: ink2, lineHeight: 1.6, fontStyle: 'italic', paddingLeft: 12, borderLeft: `2px solid ${rule}`, marginBottom: isOpen ? 16 : 0 }}>
                        {card.capsule}
                      </p>
                    )}

                    {/* ── EXPANDED CONTENT ── */}
                    {isOpen && (
                      <div style={{ borderTop: `1px solid ${rule}`, paddingTop: 20, marginTop: card.capsule ? 0 : 4 }}>

                        {/* Edit textarea */}
                        {card.isEditing && (
                          <div style={{ marginBottom: 20 }}>
                            <SectionLabel>Edit Content</SectionLabel>
                            <textarea
                              value={card.editDraft}
                              onChange={e => updateEditDraft(card.tempId, e.target.value)}
                              rows={10}
                              style={{ width: '100%', borderRadius: 2, border: `1px solid ${rule}`, fontFamily: mono, fontSize: 12, padding: 12, resize: 'vertical', outline: 'none', background: cream }}
                            />
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button onClick={() => saveEdit(card.tempId)} style={{ fontFamily: mono, fontSize: 9, padding: '6px 14px', background: navy, color: gold, border: 'none', borderRadius: 2, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>Save</button>
                              <button onClick={() => cancelEdit(card.tempId)} style={{ fontFamily: mono, fontSize: 9, padding: '6px 14px', background: 'transparent', color: ink3, border: `1px solid ${rule}`, borderRadius: 2, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>Cancel</button>
                            </div>
                          </div>
                        )}

                        {/* Facts */}
                        {card.facts.length > 0 && (
                          <div style={{ marginBottom: 20 }}>
                            <SectionLabel>Facts</SectionLabel>
                            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {card.facts.map((f, i) => (
                                <li key={i} style={{ fontSize: 13, color: ink2, lineHeight: 1.65, paddingLeft: 24, position: 'relative' }}>
                                  <span style={{ position: 'absolute', left: 0, fontFamily: mono, fontSize: 10, color: ink3, fontWeight: 500, top: 3 }}>{i + 1}</span>
                                  {f}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Provisions */}
                        {card.provisions.length > 0 && (
                          <div style={{ marginBottom: 20 }}>
                            <SectionLabel>Key Provisions</SectionLabel>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {card.provisions.map((p, i) => (
                                <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'baseline', padding: '8px 12px', background: cream, borderRadius: 2 }}>
                                  <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 500, color: navy, whiteSpace: 'nowrap', flexShrink: 0 }}>{p.provision}</span>
                                  <span style={{ fontSize: 13, color: ink2, lineHeight: 1.5 }}>{p.interpretation}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Holdings */}
                        {card.holdings.length > 0 && (
                          <div style={{ marginBottom: 20 }}>
                            <SectionLabel>Holdings</SectionLabel>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {card.holdings.map((h, i) => {
                                const bg     = h.core ? '#eff6ff' : h.type === 'ratio' ? '#f0fdf4' : '#fafaf9'
                                const border = h.core ? navy     : h.type === 'ratio' ? sage     : rule
                                const tagClr = h.core ? navy     : h.type === 'ratio' ? sage     : ink3
                                return (
                                  <div key={i} style={{ padding: '10px 14px', borderRadius: 2, background: bg, borderLeft: `3px solid ${border}` }}>
                                    <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4, color: tagClr }}>
                                      H{i + 1} · {h.label}{h.core ? ' · CORE' : ''} · {h.type}
                                    </div>
                                    <div style={{ fontSize: 13, color: ink, lineHeight: 1.65 }}>{h.text}</div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Doctrine */}
                        {card.doctrine?.name && (
                          <div style={{ marginBottom: 20 }}>
                            <SectionLabel>Doctrinal Lineage</SectionLabel>
                            <div style={{ fontFamily: mono, fontSize: 11, color: ink2, background: cream, padding: '10px 14px', borderRadius: 2, lineHeight: 1.8 }}>
                              <strong>{card.doctrine.name}</strong> · Status: <strong>{card.doctrine.status}</strong>
                              {card.doctrine.lineage_chain && card.doctrine.lineage_chain !== 'None' && (
                                <><br /><br />{card.doctrine.lineage_chain}</>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Keywords */}
                        {card.keywords.length > 0 && (
                          <div style={{ marginBottom: 20, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {card.keywords.map((kw, i) => (
                              <span key={i} style={{ fontFamily: mono, fontSize: 9, padding: '3px 8px', borderRadius: 2, background: cream, color: ink3, border: `1px solid ${rule}` }}>{kw}</span>
                            ))}
                          </div>
                        )}

                        {/* MCQs */}
                        {card.mcqs && card.mcqs.length > 0 && (
                          <div style={{ marginBottom: 20 }}>
                            <SectionLabel>Practice Questions</SectionLabel>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {card.mcqs.map((mcq, qi) => {
                                const qKey      = `${card.tempId}-${qi}`
                                const selected  = quizAnswers[qKey]
                                const isCorrect = selected === mcq.answer
                                const diffBg  = mcq.difficulty === 'easy' ? 'rgba(22,101,52,.5)' : mcq.difficulty === 'medium' ? 'rgba(180,83,9,.5)' : 'rgba(185,28,28,.5)'
                                const diffTxt = mcq.difficulty === 'easy' ? '#bbf7d0' : mcq.difficulty === 'medium' ? '#fde68a' : '#fecaca'
                                return (
                                  <div key={qi} style={{ background: cream, borderRadius: 4, overflow: 'hidden' }}>
                                    {/* MCQ header */}
                                    <div style={{ background: navy, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                                      <span style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, color: gold, textTransform: 'uppercase', letterSpacing: 1.5 }}>
                                        Q{qi + 1} · {mcq.type === 'case_recall' ? 'Case Recall' : mcq.type === 'statement_evaluation' ? 'Statement Eval' : 'Application'}
                                      </span>
                                      {mcq.difficulty && (
                                        <span style={{ fontFamily: mono, fontSize: 9, padding: '2px 7px', borderRadius: 2, textTransform: 'uppercase', background: diffBg, color: diffTxt }}>
                                          {mcq.difficulty}
                                        </span>
                                      )}
                                      <span style={{ fontFamily: mono, fontSize: 10, color: 'rgba(255,255,255,0.4)', marginLeft: 'auto' }}>
                                        {qi + 1} of {card.mcqs.length}
                                      </span>
                                    </div>
                                    {/* MCQ body */}
                                    <div style={{ padding: 14 }}>
                                      <div style={{ fontSize: 14, fontWeight: 500, color: ink, lineHeight: 1.65, marginBottom: 12 }}>
                                        {mcq.question}
                                      </div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {mcq.options.map((opt, oi) => {
                                          const letter     = opt.charAt(0)
                                          const optText    = opt.substring(1).replace(/^[.)]\s*/, '').trim()
                                          const isSelected = selected === letter
                                          const isAnswer   = mcq.answer === letter
                                          return (
                                            <button key={oi} disabled={!!selected}
                                              onClick={() => !selected && setQuizAnswers(prev => ({ ...prev, [qKey]: letter }))}
                                              style={{
                                                display: 'flex', gap: 10, alignItems: 'flex-start',
                                                padding: '8px 12px', borderRadius: 2,
                                                border: `1px solid ${!selected ? rule : isAnswer ? sage : isSelected ? high : rule}`,
                                                cursor: selected ? 'default' : 'pointer',
                                                background: !selected ? '#fff' : isAnswer ? '#f0fdf4' : isSelected ? '#fef2f2' : '#fff',
                                                fontSize: 13, color: !selected ? ink2 : isAnswer ? ink : isSelected ? ink : ink3,
                                                lineHeight: 1.5, textAlign: 'left', fontFamily: lora,
                                                opacity: selected && !isAnswer && !isSelected ? 0.55 : 1, transition: 'all .12s',
                                              }}
                                            >
                                              <span style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, color: !selected ? ink3 : isAnswer ? sage : isSelected ? high : ink3, flexShrink: 0, marginTop: 2, minWidth: 14 }}>
                                                {letter}
                                              </span>
                                              {optText || opt}
                                            </button>
                                          )
                                        })}
                                      </div>
                                      {selected && (
                                        <div style={{ marginTop: 10, padding: '10px 12px', background: '#fff', borderRadius: 2, borderLeft: `3px solid ${sage}`, fontSize: 12, color: ink2, lineHeight: 1.65, fontStyle: 'italic' }}>
                                          <strong style={{ fontStyle: 'normal', color: isCorrect ? sage : high, fontFamily: mono, fontSize: 10, display: 'block', marginBottom: 4 }}>
                                            {isCorrect ? '✓ Correct' : `✗ Incorrect — Answer: ${mcq.answer}`}
                                          </strong>
                                          {mcq.explanation}
                                          {mcq.holding_ref && (
                                            <div style={{ fontFamily: mono, fontSize: 10, color: navy, fontStyle: 'normal', fontWeight: 500, marginTop: 6 }}>— {mcq.holding_ref}</div>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}

                        {/* Admin actions */}
                        <div style={{ display: 'flex', gap: 8, paddingTop: 14, borderTop: `1px solid ${rule}` }}>
                          {!card.isEditing && (
                            <button onClick={() => startEdit(card.tempId)} style={{ fontFamily: mono, fontSize: 9, padding: '5px 12px', background: 'transparent', color: ink3, border: `1px solid ${rule}`, borderRadius: 2, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>Edit</button>
                          )}
                          {card.previewImage && (
                            <button onClick={() => setClippingId(card.tempId)} style={{ fontFamily: mono, fontSize: 9, padding: '5px 12px', background: 'transparent', color: ink3, border: `1px solid ${rule}`, borderRadius: 2, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>Verify Clipping</button>
                          )}
                          <button onClick={() => { deleteCard(card.tempId); setOpenCards(prev => { const s = new Set(prev); s.delete(card.tempId); return s }) }} style={{ fontFamily: mono, fontSize: 9, padding: '5px 12px', background: 'transparent', color: high, border: '1px solid #fecaca', borderRadius: 2, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1 }}>Delete</button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card footer */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', background: cream, borderTop: `1px solid ${rule}` }}>
                    <span style={{ fontFamily: mono, fontSize: 9, color: ink3, textTransform: 'uppercase', letterSpacing: 1 }}>
                      {sourcePaper} · {card.subject || card.category}{card.isDirty ? ' · edited' : ''}
                    </span>
                    <button onClick={() => toggleCard(card.tempId)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontFamily: mono, fontSize: 9, fontWeight: 500, color: navy2, textTransform: 'uppercase', letterSpacing: 1, cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}>
                      Study note <span style={{ transition: 'transform .2s', display: 'inline-block', fontSize: 11, transform: isOpen ? 'rotate(180deg)' : 'none' }}>▾</span>
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          {/* Save / Publish buttons */}
          {cards.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginTop: 32, position: 'sticky', bottom: 24 }}>
              <button onClick={() => handleSave(false)} style={{ flex: 1, padding: '12px 0', background: '#fff', border: `1px solid ${rule}`, borderRadius: 4, fontFamily: mono, fontSize: 11, color: ink2, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                Save as Draft ({cards.length})
              </button>
              <button onClick={() => handleSave(true)} style={{ flex: 1, padding: '12px 0', background: navy, border: 'none', borderRadius: 4, fontFamily: mono, fontSize: 11, color: gold, cursor: 'pointer', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                Publish All ({cards.length})
              </button>
            </div>
          )}
        </div>

        {/* Clipping lightbox */}
        {clippingId && (() => {
          const cc = cards.find(c => c.tempId === clippingId)
          if (!cc?.previewImage) return null
          return (
            <div onClick={() => setClippingId(null)} style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, maxWidth: 768, width: '100%', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 20px', borderBottom: `1px solid ${rule}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                  <p style={{ fontFamily: mono, fontSize: 11, color: ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cc.title}</p>
                  <button onClick={() => setClippingId(null)} style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 6, background: cream, border: 'none', cursor: 'pointer', color: ink3, fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
                <div style={{ overflow: 'auto', flex: 1 }}>
                  <img src={cc.previewImage} alt="Newspaper clipping" style={{ width: '100%', objectFit: 'contain' }} />
                </div>
                <div style={{ padding: '8px 20px', borderTop: `1px solid ${rule}`, background: cream, fontFamily: mono, fontSize: 10, color: ink3, textAlign: 'center', flexShrink: 0 }}>
                  Verification only — not saved to database
                </div>
              </div>
            </div>
          )
        })()}
      </div>
    )
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const isLoading = step === 'extracting' || step === 'generating'

  const loadingMessages: Record<string, string> = {
    extracting: 'Reading PDF pages...',
    generating: 'AI is reading the newspaper and highlighting key articles...',
    saving: 'Saving articles to database...',
  }

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.push('/admin/news')}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <div className="w-px h-4 bg-border" />
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <Newspaper className="w-5 h-5" />
              Process Newspaper
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">Extract law-related articles with AI highlights</p>
          </div>
        </div>

        {/* Loading overlay */}
        {isLoading && (
          <div className="rounded-xl border bg-card p-10 text-center mb-6">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="font-medium">{loadingMessages[step]}</p>
            {step === 'generating' && (
              <p className="text-sm text-muted-foreground mt-1">This may take 10–30 seconds depending on the provider</p>
            )}
          </div>
        )}

        {/* ── Input Step ── */}
        {step === 'input' && (
          <div className="space-y-5">
            {/* Date + Source row */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Newspaper Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Source
                </label>
                <input
                  type="text"
                  value={sourcePaper}
                  onChange={e => setSourcePaper(e.target.value)}
                  placeholder="e.g. The Hindu"
                  className="w-full h-10 px-3 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            {/* Max articles toggle */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Max Articles to Extract
              </label>
              <div className="flex gap-2 flex-wrap">
                {[5, 6, 7, 8, 9, 10].map(n => (
                  <button
                    key={n}
                    onClick={() => setMaxArticles(n)}
                    className={`h-9 w-9 rounded-lg text-sm font-semibold transition-colors ${
                      maxArticles === n
                        ? 'bg-primary text-primary-foreground'
                        : 'border bg-background hover:bg-muted'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            {/* PDF drop zone */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                Newspaper PDF
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                className={`relative flex flex-col items-center justify-center gap-3 h-36 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : pdfFile
                      ? 'border-green-400 bg-green-50/50 dark:bg-green-950/20'
                      : 'border-border hover:border-primary/50 hover:bg-muted/40'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
                />
                {pdfFile ? (
                  <>
                    <FileText className="w-8 h-8 text-green-600 dark:text-green-400" />
                    <div className="text-center">
                      <p className="text-sm font-medium text-green-700 dark:text-green-400">{pdfFile.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {(pdfFile.size / 1024 / 1024).toFixed(1)} MB — click to change
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="w-7 h-7 text-muted-foreground" />
                    <div className="text-center">
                      <p className="text-sm font-medium">Drop PDF here or click to browse</p>
                      <p className="text-xs text-muted-foreground mt-0.5">PDF is only used for text extraction — not stored</p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Model selector */}
            <div>
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                AI Model
              </label>
              <div className="flex gap-2 flex-wrap">
                {[
                  { id: 'auto',            label: 'Auto',            sub: 'cascade' },
                  // Groq — fast, free, smart 70b
                  { id: 'groq',            label: 'LLaMA 3.3 70B',   sub: 'Groq · fast ⚡' },
                  { id: 'groq-scout',      label: 'LLaMA 4 Scout',   sub: 'Groq · fast ⚡' },
                  // OpenRouter — currently working
                  { id: 'gemini-free',     label: 'Gemini Flash',    sub: 'OR · free' },
                  { id: 'llama70b-free',   label: 'LLaMA 3.3 70B',   sub: 'OR · free' },
                  { id: 'gemini-flash',    label: 'Gemini 2.5 Flash', sub: 'OR · paid' },
                  { id: 'mistral',         label: 'Mistral 24B',     sub: 'OR · free' },
                  // NVIDIA — slower, last resort
                  { id: 'nvidia-kimi',     label: 'Kimi K2.5',       sub: 'NVIDIA · slow' },
                  { id: 'nvidia-nemotron', label: 'Nemotron 49B',    sub: 'NVIDIA · slow' },
                  { id: 'nvidia-llama70b', label: 'LLaMA 3.3 70B',   sub: 'NVIDIA · slow' },
                ].map(m => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedModel(m.id)}
                    className={`flex flex-col items-start px-3 py-2 rounded-lg border text-left transition-colors ${
                      selectedModel === m.id
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted border-border'
                    }`}
                  >
                    <span className="text-xs font-semibold">{m.label}</span>
                    <span className={`text-[10px] ${selectedModel === m.id ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>{m.sub}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-950/30 dark:border-red-800 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            <button
              onClick={handleExtract}
              disabled={!pdfFile}
              className="w-full h-11 rounded-xl text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Extract Law News
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
