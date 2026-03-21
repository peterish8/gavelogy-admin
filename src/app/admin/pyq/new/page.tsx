'use client'

import { useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft,
  Wand2,
  Save,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Plus,
  Loader2,
  GripVertical,
  ClipboardPaste,
  Info,
  FileUp,
  Sparkles,
  Copy,
  Check,
  BookOpen,
  Unlink,
  Link2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── System prompt for copy-paste with any AI ────────────────────────────────

const AI_SYSTEM_PROMPT = `You are extracting MCQ questions from a law exam PYQ (Previous Year Question) paper for an Indian exam prep platform (CLAT PG / AILET / Judiciary / UPSC Law).

OUTPUT: Return ONLY a valid JSON array. No markdown, no explanation, no code blocks — just the raw JSON.

PASSAGE HANDLING (very important for CLAT PG):
- Many questions are based on a shared reading passage (1 passage → 5-10 questions)
- Assign a passage_group tag to group such questions: "P1", "P2", "P3", etc.
- Include the full passage_text ONLY on the FIRST question of each group
- For all subsequent questions in the same group: same passage_group, but passage_text: ""
- Questions with NO passage: passage_group: null, passage_text: ""

JSON FORMAT — return exactly this structure for every question:
[
  {
    "passage_group": "P1",
    "passage_text": "The full passage text here... (only on first question of the group)",
    "question_text": "According to the passage, which of the following is correct?",
    "option_a": "First option text",
    "option_b": "Second option text",
    "option_c": "Third option text",
    "option_d": "Fourth option text",
    "correct_answer": "B",
    "explanation": "Brief explanation if printed in the paper, otherwise empty string"
  },
  {
    "passage_group": "P1",
    "passage_text": "",
    "question_text": "Another question about the same passage above",
    "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...",
    "correct_answer": "A",
    "explanation": ""
  },
  {
    "passage_group": null,
    "passage_text": "",
    "question_text": "A standalone question not based on any passage",
    "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...",
    "correct_answer": "C",
    "explanation": ""
  }
]

RULES:
- correct_answer must be EXACTLY one of: "A", "B", "C", "D" (uppercase single letter)
- If options are numbered (1/2/3/4), map them: 1→A, 2→B, 3→C, 4→D
- If options are lowercase (a/b/c/d), convert to uppercase: A/B/C/D
- If the answer key is at the END of the paper (separate from questions), match answers to questions by number
- Strip question numbers from question_text (remove "1." "Q1." "Q.1" "1)" etc.)
- Clean up OCR artifacts, broken line breaks, and extra whitespace
- If you cannot determine the correct answer, use "" for correct_answer
- Extract ALL questions — do not skip any
- Start your response with "[" and end with "]" — nothing else`

// ─── Types ────────────────────────────────────────────────────────────────────

interface TestMeta {
  title: string
  exam_name: string
  year: string
  duration_minutes: string
  total_marks: string
  negative_marking: string
  instructions: string
  is_published: boolean
}

// A parsed question before saving — uses passage_group for grouping
interface ParsedQuestion {
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: string
  explanation: string
  // passage fields
  passage_group: string | null   // e.g. "P1", "P2", or null for standalone
  passage_text: string           // full text only on first Q of the group
  // ui state
  _expanded: boolean
  _error?: string
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

function validateQ(q: Partial<ParsedQuestion>): string | undefined {
  if (!q.option_a || !q.option_b || !q.option_c || !q.option_d) return 'Missing options'
  if (!['A', 'B', 'C', 'D'].includes(q.correct_answer || '')) return 'No correct answer'
  return undefined
}

/** Parse raw text format (same logic as before) */
function parseFromText(raw: string): ParsedQuestion[] {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = normalized
    .split(/(?=^\s*(?:Q\.?\s*)?\d+[\.\)]\s)/m)
    .map(b => b.trim())
    .filter(Boolean)

  return blocks.flatMap(block => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length < 3) return []

    const questionLines: string[] = []
    const options: Record<string, string> = {}
    let correctAnswer = ''
    const explanationLines: string[] = []
    let inExplanation = false
    let inOptions = false

    for (const line of lines) {
      const answerMatch = line.match(
        /^(?:ans(?:wer)?|correct(?:\s+answer)?)\s*[:\.]?\s*[\(\[]?\s*([A-Da-d1-4])\s*[\)\]]?/i
      )
      if (answerMatch) {
        const map: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' }
        correctAnswer = (map[answerMatch[1].toUpperCase()] || answerMatch[1].toUpperCase())
        inExplanation = false
        continue
      }
      if (/^(?:explanation|exp|solution|reason|rationale)\s*[:\.]?\s*/i.test(line)) {
        inExplanation = true
        const body = line.replace(/^(?:explanation|exp|solution|reason|rationale)\s*[:\.]?\s*/i, '').trim()
        if (body) explanationLines.push(body)
        continue
      }
      if (inExplanation) { explanationLines.push(line); continue }

      const optionMatch = line.match(/^[\(\[]?\s*([A-Da-d1-4])\s*[\)\]\.]?\s+(.+)/)
      if (optionMatch) {
        const map: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' }
        const key = map[optionMatch[1].toUpperCase()] || optionMatch[1].toUpperCase()
        if (['A', 'B', 'C', 'D'].includes(key)) {
          options[key] = optionMatch[2].trim()
          inOptions = true
          continue
        }
      }
      if (!inOptions) questionLines.push(line)
    }

    const questionText = questionLines
      .join(' ')
      .replace(/^\s*(?:Q\.?\s*)?\d+[\.\)]\s*/, '')
      .trim()

    if (!questionText) return []
    const q: ParsedQuestion = {
      question_text: questionText,
      option_a: options['A'] || '',
      option_b: options['B'] || '',
      option_c: options['C'] || '',
      option_d: options['D'] || '',
      correct_answer: correctAnswer,
      explanation: explanationLines.join(' ').trim(),
      passage_group: null,
      passage_text: '',
      _expanded: false,
    }
    q._error = validateQ(q)
    return [q]
  })
}

/** Parse JSON format (from AI or from /api/pyq/parse) */
function parseFromJSON(raw: string): ParsedQuestion[] {
  // Strip markdown code fences
  const cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim()
  const start = cleaned.indexOf('[')
  const end = cleaned.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error('No JSON array found')
  const parsed = JSON.parse(cleaned.slice(start, end + 1))
  if (!Array.isArray(parsed)) throw new Error('Not a JSON array')

  return parsed.map((item: any) => {
    const map: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' }
    const rawCorrect = String(item.correct_answer || item.answer || item.ans || item.correct || item.key || '').trim().toUpperCase()
    const ca = rawCorrect.charAt(0)

    const q: ParsedQuestion = {
      question_text: String(item.question_text || item.question || '').trim(),
      option_a: String(item.option_a || item.a || '').trim(),
      option_b: String(item.option_b || item.b || '').trim(),
      option_c: String(item.option_c || item.c || '').trim(),
      option_d: String(item.option_d || item.d || '').trim(),
      correct_answer: map[ca] || ca,
      explanation: String(item.explanation || '').trim(),
      passage_group: item.passage_group ? String(item.passage_group).trim() : null,
      passage_text: String(item.passage_text || '').trim(),
      _expanded: false,
    }
    q._error = validateQ(q)
    return q
  }).filter((q: ParsedQuestion) => q.question_text.length > 3)
}

/** Detect whether text is JSON */
function looksLikeJSON(text: string): boolean {
  const trimmed = text.trimStart().replace(/^```(?:json)?\s*/i, '')
  return trimmed.startsWith('[') || trimmed.startsWith('{')
}

// ─── Passage summary helper ───────────────────────────────────────────────────

function getPassageSummary(questions: ParsedQuestion[]): { group: string; text: string; count: number }[] {
  const groups = new Map<string, { text: string; count: number }>()
  for (const q of questions) {
    if (!q.passage_group) continue
    if (!groups.has(q.passage_group)) {
      const passageText = q.passage_text || questions.find(
        x => x.passage_group === q.passage_group && x.passage_text
      )?.passage_text || ''
      groups.set(q.passage_group, { text: passageText, count: 0 })
    }
    groups.get(q.passage_group)!.count++
  }
  return Array.from(groups.entries()).map(([group, v]) => ({ group, ...v }))
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NewPYQTestPage() {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [meta, setMeta] = useState<TestMeta>({
    title: '',
    exam_name: 'CLAT PG',
    year: new Date().getFullYear().toString(),
    duration_minutes: '120',
    total_marks: '120',
    negative_marking: '0.25',
    instructions: '',
    is_published: false,
  })

  const [pasteText, setPasteText] = useState('')
  const [questions, setQuestions] = useState<ParsedQuestion[]>([])
  const [parseError, setParseError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isUploading, setIsUploading] = useState<false | 'extracting' | 'analyzing'>(false)
  const [uploadError, setUploadError] = useState('')
  const [activeTab, setActiveTab] = useState<'input' | 'questions'>('input')
  const [promptCopied, setPromptCopied] = useState(false)
  const [qaCopied, setQaCopied] = useState(false)
  const [showPrompt, setShowPrompt] = useState(false)
  const [showFormatGuide, setShowFormatGuide] = useState(false)
  const [inputMode, setInputMode] = useState<'pdf' | 'ai-paste' | 'manual'>('pdf')

  // ── Parse ──────────────────────────────────────────────────────────────────
  const handleParse = useCallback(() => {
    setParseError('')
    if (!pasteText.trim()) {
      setParseError('Paste some text first.')
      return
    }
    try {
      let parsed: ParsedQuestion[]
      if (looksLikeJSON(pasteText)) {
        parsed = parseFromJSON(pasteText)
      } else {
        parsed = parseFromText(pasteText)
      }
      if (parsed.length === 0) {
        setParseError('Could not detect any questions. Check the format guide below.')
        return
      }
      setQuestions(parsed)
      setActiveTab('questions')
    } catch (e: any) {
      setParseError(`Parse error: ${e.message}`)
    }
  }, [pasteText])

  // ── PDF Upload ─────────────────────────────────────────────────────────────
  const handlePDFUpload = async (file: File) => {
    setUploadError('')
    setIsUploading('extracting')

    try {
      // 1. Extract text from PDF using pdfjs-dist
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

      let fullText = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(' ')
        fullText += `\n${pageText}`
      }

      if (!fullText.trim()) {
        throw new Error('Could not extract text from this PDF. It may be a scanned image — try the manual paste method.')
      }

      // 2. Send to AI for structured extraction
      setIsUploading('analyzing')
      const res = await fetch('/api/pyq/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfText: fullText, fileName: file.name }),
      })

      const data = await res.json()

      if (!res.ok || data.error) {
        throw new Error(data.error || 'AI parsing failed')
      }

      // data.questions is already structured from the API
      const parsed: ParsedQuestion[] = (data.questions || []).map((q: any) => ({
        ...q,
        _expanded: false,
        _error: validateQ(q),
      }))

      if (parsed.length === 0) {
        throw new Error('No questions could be extracted. Try the manual paste method.')
      }

      setQuestions(parsed)
      setActiveTab('questions')

      if (data.truncated) {
        setUploadError(`Note: PDF text was truncated. ${parsed.length} questions extracted. Add remaining questions manually.`)
      }
    } catch (e: any) {
      setUploadError(e.message)
    } finally {
      setIsUploading(false)
    }
  }

  // ── Copy AI Prompt ─────────────────────────────────────────────────────────
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(AI_SYSTEM_PROMPT)
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 3000)
    } catch {
      // fallback for insecure context
      const el = document.createElement('textarea')
      el.value = AI_SYSTEM_PROMPT
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      setPromptCopied(true)
      setTimeout(() => setPromptCopied(false), 3000)
    }
  }

  // ── Copy Q&A for verification ──────────────────────────────────────────────
  const copyQA = async () => {
    const lines = questions.map((q, i) => {
      const passageTag = q.passage_group ? `[Passage ${q.passage_group}] ` : ''
      const passageText = q.passage_text ? `\nPASSAGE: ${q.passage_text}\n` : ''
      return [
        `${passageText}Q${i + 1}. ${passageTag}${q.question_text}`,
        `   A. ${q.option_a}`,
        `   B. ${q.option_b}`,
        `   C. ${q.option_c}`,
        `   D. ${q.option_d}`,
        `   ✓ Answer: ${q.correct_answer || '?'}${q.explanation ? `\n   Explanation: ${q.explanation}` : ''}`,
      ].join('\n')
    })
    const text = `PARSED QUESTIONS — ${questions.length} total\n${'─'.repeat(60)}\n\n${lines.join('\n\n')}`
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setQaCopied(true)
    setTimeout(() => setQaCopied(false), 3000)
  }

  // ── Question editors ───────────────────────────────────────────────────────
  const updateQuestion = (index: number, field: keyof ParsedQuestion, value: string | boolean | null) => {
    setQuestions(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      updated[index]._error = validateQ(updated[index])
      return updated
    })
  }

  const removeQuestion = (index: number) => {
    setQuestions(prev => prev.filter((_, i) => i !== index))
  }

  const addBlankQuestion = () => {
    setQuestions(prev => [...prev, {
      question_text: '', option_a: '', option_b: '', option_c: '', option_d: '',
      correct_answer: '', explanation: '', passage_group: null, passage_text: '',
      _expanded: true, _error: 'Missing options',
    }])
    setActiveTab('questions')
  }

  const toggleExpand = (index: number) => {
    setQuestions(prev => {
      const u = [...prev]
      u[index] = { ...u[index], _expanded: !u[index]._expanded }
      return u
    })
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!meta.title.trim()) { alert('Enter a test title.'); return }
    if (questions.length === 0) { alert('Add at least one question.'); return }
    const invalid = questions.filter(q => q._error)
    if (invalid.length > 0 && !confirm(`${invalid.length} question(s) have issues. Save anyway?`)) return

    setIsSaving(true)
    try {
      // 1. Create the test record
      const { data: test, error: testErr } = await supabase
        .from('pyq_tests')
        .insert({
          title: meta.title.trim(),
          exam_name: meta.exam_name.trim(),
          year: meta.year ? parseInt(meta.year) : null,
          duration_minutes: parseInt(meta.duration_minutes) || 120,
          total_marks: parseInt(meta.total_marks) || 120,
          negative_marking: parseFloat(meta.negative_marking) || 0.25,
          instructions: meta.instructions.trim() || null,
          is_published: meta.is_published,
        })
        .select('id')
        .single()

      if (testErr || !test) {
        const msg = testErr?.message || testErr?.details || testErr?.hint || JSON.stringify(testErr) || 'Failed to create test'
        throw new Error(msg)
      }

      // 2. Collect unique passages — one entry per passage_group
      const passageGroupMap = new Map<string, string>() // group → db passage id

      const uniqueGroups = new Map<string, string>() // group → passage_text
      for (const q of questions) {
        if (q.passage_group && !uniqueGroups.has(q.passage_group)) {
          // Find the passage_text for this group (first question that has it)
          const passageText = questions.find(
            x => x.passage_group === q.passage_group && x.passage_text
          )?.passage_text || ''
          if (passageText) uniqueGroups.set(q.passage_group, passageText)
        }
      }

      // 3. Insert passages (if pyq_passages table exists)
      if (uniqueGroups.size > 0) {
        const passagesToInsert = Array.from(uniqueGroups.entries()).map(([, text], i) => ({
          test_id: test.id,
          order_index: i,
          passage_text: text,
        }))

        const { data: insertedPassages, error: passErr } = await supabase
          .from('pyq_passages')
          .insert(passagesToInsert)
          .select('id, passage_text')

        if (passErr) {
          // Table may not exist yet — skip passages but continue saving questions
          console.warn('[pyq/save] pyq_passages insert failed (table may not exist yet):', passErr.message)
        } else {
          Array.from(uniqueGroups.entries()).forEach(([group, text]) => {
            const dbPassage = insertedPassages?.find((p: any) => p.passage_text === text)
            if (dbPassage) passageGroupMap.set(group, dbPassage.id)
          })
        }
      }

      // 4. Insert questions
      const questionsBase = questions.map((q, i) => ({
        test_id: test.id,
        order_index: i,
        question_text: q.question_text.trim(),
        option_a: q.option_a.trim(),
        option_b: q.option_b.trim(),
        option_c: q.option_c.trim(),
        option_d: q.option_d.trim(),
        correct_answer: q.correct_answer.toUpperCase(),
        explanation: q.explanation.trim() || null,
        marks: 1,
      }))

      // Try with passage_id first; if column doesn't exist yet, fall back without it
      const withPassageId = questionsBase.map((q, i) => ({
        ...q,
        passage_id: passageGroupMap.get(questions[i].passage_group ?? '') ?? null,
      }))

      let { error: qErr } = await supabase.from('pyq_questions').insert(withPassageId)

      if (qErr?.message?.includes('passage_id')) {
        // Column not yet migrated — save without passage_id
        console.warn('[pyq/save] passage_id column missing, saving without it. Run the migration SQL.')
        const fallback = await supabase.from('pyq_questions').insert(questionsBase)
        qErr = fallback.error
      }

      if (qErr) {
        const msg = qErr.message || qErr.details || qErr.hint || JSON.stringify(qErr)
        throw new Error(`Questions insert failed: ${msg}`)
      }

      router.push(`/admin/pyq/${test.id}/edit`)
    } catch (err: any) {
      const msg = err?.message || err?.details || err?.hint || JSON.stringify(err)
      console.error('[pyq/save] error:', msg, err)
      alert(`Save failed: ${msg}`)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  const errorCount = questions.filter(q => q._error).length
  const okCount = questions.length - errorCount
  const passageSummary = getPassageSummary(questions)
  const standaloneCount = questions.filter(q => !q.passage_group).length

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-24">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/pyq">
          <button className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">New PYQ Mock Test</h1>
          <p className="text-sm text-muted-foreground">Upload PDF or paste questions — AI handles the rest</p>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving || questions.length === 0 || !meta.title}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-semibold shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Test
        </button>
      </div>

      {/* ── Test Metadata ── */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-bold text-foreground text-lg">Exam Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="md:col-span-2 xl:col-span-3">
            <label className="block text-sm font-medium text-foreground mb-1.5">Test Title *</label>
            <input
              type="text"
              value={meta.title}
              onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
              placeholder="e.g. CLAT PG 2024 Official Paper"
              className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Exam Name</label>
            <input type="text" value={meta.exam_name} onChange={e => setMeta(m => ({ ...m, exam_name: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Year</label>
            <input type="number" value={meta.year} onChange={e => setMeta(m => ({ ...m, year: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Duration (minutes)</label>
            <input type="number" value={meta.duration_minutes} onChange={e => setMeta(m => ({ ...m, duration_minutes: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Total Marks</label>
            <input type="number" value={meta.total_marks} onChange={e => setMeta(m => ({ ...m, total_marks: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Negative Marking</label>
            <select value={meta.negative_marking} onChange={e => setMeta(m => ({ ...m, negative_marking: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="0">None (0)</option>
              <option value="0.25">−0.25 per wrong</option>
              <option value="0.33">−0.33 per wrong</option>
              <option value="0.5">−0.5 per wrong</option>
              <option value="1">−1 per wrong</option>
            </select>
          </div>
          <div className="md:col-span-2 xl:col-span-2">
            <label className="block text-sm font-medium text-foreground mb-1.5">Instructions (optional)</label>
            <textarea value={meta.instructions} onChange={e => setMeta(m => ({ ...m, instructions: e.target.value }))} rows={2} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
          </div>
          <div className="flex items-center gap-3 pt-5">
            <button type="button" onClick={() => setMeta(m => ({ ...m, is_published: !m.is_published }))} className={cn('relative inline-flex shrink-0 w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer', meta.is_published ? 'bg-green-500' : 'bg-muted-foreground/30')}>
              <span className={cn('pointer-events-none inline-block w-5 h-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 my-0.5', meta.is_published ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
            <span className="text-sm font-medium text-foreground">{meta.is_published ? 'Published' : 'Draft'}</span>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        {(['input', 'questions'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={cn('px-4 py-2 rounded-lg text-sm font-semibold transition-colors capitalize', activeTab === tab ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {tab === 'input' ? 'Add Questions' : `Review${questions.length ? ` (${questions.length})` : ''}`}
          </button>
        ))}
      </div>

      {/* ── INPUT TAB ── */}
      {activeTab === 'input' && (
        <div className="space-y-4">
          {/* Method selector */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {[
              { id: 'pdf', icon: FileUp, label: 'Upload PDF', desc: 'Auto-extract & parse with AI', color: 'text-primary bg-primary/10', border: 'border-primary/30' },
              { id: 'ai-paste', icon: Sparkles, label: 'Use Any AI Chat', desc: 'ChatGPT / Claude.ai / Gemini', color: 'text-purple-600 bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-300 dark:border-purple-700' },
              { id: 'manual', icon: ClipboardPaste, label: 'Manual Paste', desc: 'Paste text directly', color: 'text-slate-600 bg-slate-100 dark:bg-slate-800', border: 'border-slate-300 dark:border-slate-600' },
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setInputMode(m.id as typeof inputMode)}
                className={cn(
                  'flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all',
                  inputMode === m.id ? `${m.border} bg-card shadow-sm` : 'border-border hover:border-muted-foreground/30'
                )}
              >
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', m.color)}>
                  <m.icon className="w-5 h-5" />
                </div>
                <div>
                  <div className={cn('font-bold text-sm', inputMode === m.id ? 'text-foreground' : 'text-muted-foreground')}>{m.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{m.desc}</div>
                </div>
                {inputMode === m.id && <div className="ml-auto w-4 h-4 rounded-full bg-primary flex items-center justify-center shrink-0"><Check className="w-2.5 h-2.5 text-white" /></div>}
              </button>
            ))}
          </div>

          {/* ── PDF Upload ── */}
          {inputMode === 'pdf' && (
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div
                onClick={() => !isUploading && fileInputRef.current?.click()}
                className={cn(
                  'border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer',
                  isUploading ? 'border-primary/40 bg-primary/5 cursor-wait' : 'border-border hover:border-primary/40 hover:bg-muted/40'
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0]
                    if (file) handlePDFUpload(file)
                    e.target.value = ''
                  }}
                />
                {isUploading ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                    <p className="font-semibold text-foreground text-sm">
                      {isUploading === 'extracting' ? 'Extracting text from PDF...' : 'AI is analyzing questions...'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isUploading === 'analyzing' ? 'Parsing MCQs, options, and answers...' : 'This may take a moment'}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
                      <FileUp className="w-7 h-7 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-foreground">Click to upload PDF</p>
                      <p className="text-sm text-muted-foreground mt-1">CLAT PG, AILET, Judiciary, UPSC Law — any MCQ paper</p>
                    </div>
                    <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">PDF files only</span>
                  </div>
                )}
              </div>
              {uploadError && (
                <div className={cn('flex items-start gap-2 text-sm p-3 rounded-lg', uploadError.startsWith('Note:') ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300' : 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400')}>
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  {uploadError}
                </div>
              )}
              <p className="text-xs text-muted-foreground text-center">
                Uses AI to extract all MCQs including passages. Scanned/image PDFs may not work — use the "Use Any AI Chat" method instead.
              </p>
            </div>
          )}

          {/* ── AI Chat method ── */}
          {inputMode === 'ai-paste' && (
            <div className="space-y-4">
              {/* Step 1 */}
              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 font-bold text-foreground">
                  <span className="w-6 h-6 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full text-xs flex items-center justify-center font-bold shrink-0">1</span>
                  Copy this system prompt
                </div>
                <p className="text-sm text-muted-foreground">Paste it as the system instruction (or first message) in ChatGPT, Claude.ai, Gemini, or any AI chat.</p>

                <div className="relative">
                  <pre className={cn('bg-muted text-muted-foreground text-[11px] p-4 rounded-lg font-mono leading-relaxed transition-all whitespace-pre-wrap', showPrompt ? 'max-h-none' : 'max-h-40 overflow-hidden')}>
                    {AI_SYSTEM_PROMPT}
                  </pre>
                  {!showPrompt && (
                    <div className="absolute bottom-0 left-0 right-0 h-12 bg-linear-to-t from-muted to-transparent rounded-b-lg" />
                  )}
                  <button onClick={() => setShowPrompt(p => !p)} className="mt-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                    {showPrompt ? '▲ Show less' : '▼ Show full prompt'}
                  </button>
                </div>

                <button
                  onClick={copyPrompt}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-sm transition-all shadow-sm',
                    promptCopied ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  )}
                >
                  {promptCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {promptCopied ? 'Copied to clipboard!' : 'Copy Prompt'}
                </button>
              </div>

              {/* Step 2 */}
              <div className="bg-card border border-border rounded-xl p-5 space-y-2">
                <div className="flex items-center gap-2 font-bold text-foreground">
                  <span className="w-6 h-6 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full text-xs flex items-center justify-center font-bold shrink-0">2</span>
                  Upload your PYQ PDF to the AI chat
                </div>
                <p className="text-sm text-muted-foreground">Attach the PDF and send it. The AI will output a structured JSON with all questions, options, answers, and passages properly tagged.</p>
              </div>

              {/* Step 3 */}
              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2 font-bold text-foreground">
                  <span className="w-6 h-6 bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 rounded-full text-xs flex items-center justify-center font-bold shrink-0">3</span>
                  Paste the AI's response here & parse
                </div>
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  rows={12}
                  placeholder={`Paste the JSON output from the AI here...\n\nIt should look like:\n[\n  {\n    "passage_group": "P1",\n    "passage_text": "The Supreme Court in...",\n    "question_text": "Which case established...",\n    "option_a": "Kesavananda Bharati",\n    ...\n    "correct_answer": "A"\n  },\n  ...\n]`}
                  className="w-full px-4 py-3 bg-background border border-input rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y leading-relaxed"
                />
                {parseError && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {parseError}
                  </div>
                )}
                <button
                  onClick={handleParse}
                  disabled={!pasteText.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <Wand2 className="w-4 h-4" />
                  Parse & Import Questions
                </button>
              </div>
            </div>
          )}

          {/* ── Manual Paste ── */}
          {inputMode === 'manual' && (
            <div className="space-y-4">
              {/* Format guide */}
              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <button className="flex items-center justify-between w-full text-left" onClick={() => setShowFormatGuide(g => !g)}>
                  <div className="flex items-center gap-2 text-blue-800 dark:text-blue-300 font-semibold text-sm">
                    <Info className="w-4 h-4" />
                    Format Guide — {showFormatGuide ? 'hide' : 'show example'}
                  </div>
                  {showFormatGuide ? <ChevronUp className="w-4 h-4 text-blue-600" /> : <ChevronDown className="w-4 h-4 text-blue-600" />}
                </button>
                {showFormatGuide && (
                  <div className="mt-3 text-xs text-blue-700 dark:text-blue-300 space-y-2">
                    <p>Supports <code>(a)/(b)/(c)/(d)</code>, <code>A./B.</code>, or <code>(1)/(2)/(3)/(4)</code>. Answer: <code>Answer: A</code>, <code>Ans: (b)</code></p>
                    <pre className="bg-blue-100 dark:bg-blue-900/50 p-3 rounded-lg font-mono text-[11px] leading-relaxed overflow-x-auto whitespace-pre">{`1. The doctrine of Basic Structure was first articulated in?
(a) Kesavananda Bharati v. State of Kerala
(b) Golaknath v. State of Punjab
(c) Minerva Mills Ltd. v. Union of India
(d) AK Gopalan v. State of Madras
Answer: (a)
Explanation: The Supreme Court in Kesavananda Bharati (1973) held that Parliament cannot amend the basic structure.`}</pre>
                  </div>
                )}
              </div>

              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-foreground font-semibold">
                    <ClipboardPaste className="w-4 h-4" />
                    Paste question text
                  </div>
                  {pasteText && <button onClick={() => setPasteText('')} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>}
                </div>
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  rows={18}
                  placeholder="Paste your question paper text here..."
                  className="w-full px-4 py-3 bg-background border border-input rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 resize-y leading-relaxed"
                />
                {parseError && (
                  <div className="flex items-center gap-2 text-red-600 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {parseError}
                  </div>
                )}
                <button
                  onClick={handleParse}
                  disabled={!pasteText.trim()}
                  className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
                >
                  <Wand2 className="w-4 h-4" />
                  Parse Questions
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── QUESTIONS TAB ── */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          {questions.length === 0 ? (
            <div className="text-center py-16 bg-card rounded-xl border border-dashed border-border">
              <Wand2 className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
              <p className="text-muted-foreground font-medium">No questions yet</p>
              <button onClick={() => setActiveTab('input')} className="mt-4 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 rounded-lg transition-colors">
                Go to Add Questions →
              </button>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="flex flex-wrap items-center gap-4 bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 text-green-600 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4" /> {okCount} valid
                </div>
                {errorCount > 0 && (
                  <div className="flex items-center gap-2 text-amber-600 font-semibold text-sm">
                    <AlertCircle className="w-4 h-4" /> {errorCount} need attention
                  </div>
                )}
                {passageSummary.length > 0 && (
                  <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm">
                    <BookOpen className="w-4 h-4" />
                    {passageSummary.length} passage{passageSummary.length > 1 ? 's' : ''}
                    {' '}({passageSummary.map(p => `${p.group}: ${p.count}Q`).join(', ')})
                  </div>
                )}
                {standaloneCount > 0 && (
                  <div className="flex items-center gap-2 text-slate-500 font-semibold text-sm">
                    <Unlink className="w-4 h-4" /> {standaloneCount} standalone
                  </div>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={copyQA}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all border',
                      qaCopied
                        ? 'bg-green-500 text-white border-transparent'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted border-border'
                    )}
                  >
                    {qaCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {qaCopied ? 'Copied!' : 'Copy all Q&A'}
                  </button>
                  <button onClick={addBlankQuestion} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted rounded-lg transition-colors">
                    <Plus className="w-4 h-4" /> Add question
                  </button>
                </div>
              </div>

              {/* Questions list */}
              {questions.map((q, index) => (
                <div key={index} className={cn('bg-card border rounded-xl overflow-hidden transition-all', q._error ? 'border-amber-300 dark:border-amber-700' : 'border-border')}>
                  {/* Header */}
                  <div className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/40 transition-colors" onClick={() => toggleExpand(index)}>
                    <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                    <span className={cn('w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0', q._error ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary')}>
                      {index + 1}
                    </span>
                    {/* Passage badge */}
                    {q.passage_group && (
                      <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-0.5 rounded-full">
                        <Link2 className="w-2.5 h-2.5" />
                        {q.passage_group}
                      </span>
                    )}
                    <p className="flex-1 text-sm text-foreground line-clamp-1 font-medium">
                      {q.question_text || <span className="text-muted-foreground italic">Empty question</span>}
                    </p>
                    {q.correct_answer && (
                      <span className="shrink-0 text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full dark:bg-green-900/40 dark:text-green-400">
                        {q.correct_answer}
                      </span>
                    )}
                    {q._error && (
                      <span className="shrink-0 text-xs text-amber-600 font-medium flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> {q._error}
                      </span>
                    )}
                    <button onClick={e => { e.stopPropagation(); removeQuestion(index) }} className="shrink-0 p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                    {q._expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
                  </div>

                  {/* Editor */}
                  {q._expanded && (
                    <div className="px-4 pb-5 pt-1 border-t border-border space-y-4">
                      {/* Passage group assignment */}
                      <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
                        <BookOpen className="w-4 h-4 text-blue-600 shrink-0" />
                        <div className="flex-1">
                          <label className="block text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">Passage Group (optional)</label>
                          <input
                            type="text"
                            value={q.passage_group || ''}
                            onChange={e => updateQuestion(index, 'passage_group', e.target.value.trim().toUpperCase() || null)}
                            placeholder="P1, P2, P3... (leave empty for standalone)"
                            className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-700 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400/40"
                          />
                        </div>
                      </div>

                      {/* Passage text — only show if this is the first Q in the group OR has passage text */}
                      {q.passage_group && (
                        <div>
                          <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                            Passage Text {(() => {
                              const firstInGroup = questions.findIndex(x => x.passage_group === q.passage_group)
                              return firstInGroup === index ? '(first in group — enter the full passage here)' : '(leave empty — uses passage from first question in group)'
                            })()}
                          </label>
                          <textarea
                            value={q.passage_text}
                            onChange={e => updateQuestion(index, 'passage_text', e.target.value)}
                            rows={4}
                            placeholder="The passage text..."
                            className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
                          />
                        </div>
                      )}

                      {/* Question text */}
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Question Text *</label>
                        <textarea value={q.question_text} onChange={e => updateQuestion(index, 'question_text', e.target.value)} rows={3} className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
                      </div>

                      {/* Options */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(['option_a', 'option_b', 'option_c', 'option_d'] as const).map((field, fi) => (
                          <div key={field}>
                            <label className="block text-xs font-semibold text-muted-foreground mb-1">Option {['A', 'B', 'C', 'D'][fi]}</label>
                            <input type="text" value={q[field]} onChange={e => updateQuestion(index, field, e.target.value)} className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                          </div>
                        ))}
                      </div>

                      {/* Correct answer */}
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Correct Answer *</label>
                        <div className="flex gap-2">
                          {['A', 'B', 'C', 'D'].map(opt => (
                            <button key={opt} onClick={() => updateQuestion(index, 'correct_answer', opt)} className={cn('w-12 h-10 rounded-lg font-bold text-sm transition-colors', q.correct_answer === opt ? 'bg-green-500 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20')}>
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Explanation */}
                      <div>
                        <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Explanation (optional)</label>
                        <textarea value={q.explanation} onChange={e => updateQuestion(index, 'explanation', e.target.value)} rows={2} placeholder="Why is this the correct answer?" className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <button onClick={addBlankQuestion} className="w-full py-3 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-2">
                <Plus className="w-4 h-4" /> Add another question
              </button>
            </>
          )}
        </div>
      )}

      {/* Floating save bar */}
      {questions.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border p-4 flex items-center justify-between z-50">
          <div className="text-sm text-muted-foreground">
            <span className="font-bold text-foreground">{questions.length}</span> questions
            {passageSummary.length > 0 && <span className="ml-2 text-blue-600">· {passageSummary.length} passages (stored efficiently)</span>}
            {errorCount > 0 && <span className="ml-2 text-amber-600">· {errorCount} need attention</span>}
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving || !meta.title}
            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Test
          </button>
        </div>
      )}
    </div>
  )
}
