'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft,
  Save,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Plus,
  Loader2,
  GripVertical,
  Eye,
  RefreshCw,
  ClipboardPaste,
  X,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'

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

interface QuestionRow {
  id: string
  order_index: number
  passage: string
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: string
  explanation: string
  marks: number
  _expanded: boolean
  _dirty: boolean
  _error?: string
  _isNew?: boolean
}

function validateQ(q: Partial<QuestionRow>): string | undefined {
  if (!q.question_text?.trim()) return 'Question text is empty'
  if (!q.option_a?.trim() || !q.option_b?.trim() || !q.option_c?.trim() || !q.option_d?.trim()) return 'Missing options'
  if (!['A', 'B', 'C', 'D'].includes(q.correct_answer || '')) return 'No correct answer set'
  return undefined
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PYQEditPage() {
  const params = useParams()
  const router = useRouter()
  const testId = params.testId as string
  const supabase = createClient()

  const [meta, setMeta] = useState<TestMeta>({
    title: '',
    exam_name: 'CLAT PG',
    year: '',
    duration_minutes: '120',
    total_marks: '120',
    negative_marking: '0.25',
    instructions: '',
    is_published: false,
  })
  const [questions, setQuestions] = useState<QuestionRow[]>([])
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteRaw, setPasteRaw] = useState('')
  const [pasteError, setPasteError] = useState('')
  const [pastePreview, setPastePreview] = useState<QuestionRow[]>([])

  // ── Parse pasted JSON with passage carry-over ───────────────────────────────
  // Rules:
  //  • If a question has a non-empty `passage`, it starts a new passage group.
  //  • Subsequent questions with empty/null `passage` inherit the last active passage.
  //  • `passage_end: true` explicitly ends the current passage group.
  const parsePastedJSON = (raw: string) => {
    setPasteError('')
    setPastePreview([])
    try {
      const arr = JSON.parse(raw)
      if (!Array.isArray(arr)) throw new Error('JSON must be an array of question objects')

      let activePassage = ''
      let activeGroup = ''

      const parsed: QuestionRow[] = arr.map((item: any, i: number) => {
        const pText = (item.passage_text || item.passage || '').trim()
        const pGroup = item.passage_group

        // Detect new passage or group change
        if (pText) {
          activePassage = pText
          activeGroup = pGroup || ''
        } else if (pGroup === null || item.passage_end === true) {
          // Explicit end of passage group
          activePassage = ''
          activeGroup = ''
        } else if (pGroup && pGroup !== activeGroup) {
          // New group detected but no text provided yet? 
          // (Safety: if group changed but no text, we keep old passage unless it's explicitly null)
          // But based on user prompt, pText will be in the first one.
        }

        // Fuzzy detection for correct answer (handles correct_answer, answer, ans, correct, key)
        let correct = (item.correct_answer || item.answer || item.ans || item.correct || item.key || '').toString().toUpperCase().trim()
        
        // Map numeric correct answers to letters just in case the AI missed the prompt instruction
        if (correct === '1') correct = 'A'
        if (correct === '2') correct = 'B'
        if (correct === '3') correct = 'C'
        if (correct === '4') correct = 'D'

        const row: QuestionRow = {
          id: `paste_${Date.now()}_${i}`,
          order_index: (questions.length) + i,
          passage: activePassage,
          question_text: (item.question_text || item.question || '').trim(),
          option_a: (item.option_a || item.a || '').trim(),
          option_b: (item.option_b || item.b || '').trim(),
          option_c: (item.option_c || item.c || '').trim(),
          option_d: (item.option_d || item.d || '').trim(),
          correct_answer: correct,
          explanation: (item.explanation || '').trim(),
          marks: item.marks || 1,
          _expanded: false,
          _dirty: true,
          _isNew: true,
          _error: undefined,
        }
        row._error = validateQ(row)
        return row
      })

      setPastePreview(parsed)
    } catch (e: any) {
      setPasteError(e.message || 'Invalid JSON')
    }
  }

  const confirmPaste = () => {
    setQuestions(prev => [...prev, ...pastePreview])
    setPasteRaw('')
    setPastePreview([])
    setPasteError('')
    setShowPasteModal(false)
  }

  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState('')

  // ── Load data ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setIsLoading(true)
    setError('')
    try {
      const [{ data: test, error: testErr }, { data: qs, error: qsErr }] = await Promise.all([
        supabase.from('pyq_tests').select('*').eq('id', testId).single(),
        supabase.from('pyq_questions').select('*').eq('test_id', testId).order('order_index'),
      ])

      if (testErr) throw testErr
      if (qsErr) throw qsErr

      if (test) {
        setMeta({
          title: test.title || '',
          exam_name: test.exam_name || 'CLAT PG',
          year: test.year?.toString() || '',
          duration_minutes: test.duration_minutes?.toString() || '120',
          total_marks: test.total_marks?.toString() || '120',
          negative_marking: test.negative_marking?.toString() || '0.25',
          instructions: test.instructions || '',
          is_published: test.is_published || false,
        })
      }

      setQuestions(
        (qs || []).map((q: any) => ({
          ...q,
          _expanded: false,
          _dirty: false,
          _error: validateQ(q),
        }))
      )
    } catch (err: any) {
      setError(err.message || 'Failed to load')
    } finally {
      setIsLoading(false)
    }
  }, [testId])

  useEffect(() => { loadData() }, [loadData])

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateQ = (index: number, field: keyof QuestionRow, value: string | boolean | number) => {
    setQuestions(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value, _dirty: true }
      updated[index]._error = validateQ(updated[index])
      return updated
    })
  }

  const toggleExpand = (index: number) => {
    setQuestions(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], _expanded: !updated[index]._expanded }
      return updated
    })
  }

  const removeQuestion = async (index: number) => {
    const q = questions[index]
    if (!q._isNew && !confirm('Delete this question?')) return
    if (!q._isNew) {
      await supabase.from('pyq_questions').delete().eq('id', q.id)
    }
    setQuestions(prev => prev.filter((_, i) => i !== index))
  }

  const addBlankQuestion = () => {
    setQuestions(prev => [
      ...prev,
      {
        id: `new_${Date.now()}`,
        order_index: prev.length,
        passage: '',
        question_text: '',
        option_a: '',
        option_b: '',
        option_c: '',
        option_d: '',
        correct_answer: '',
        explanation: '',
        marks: 1,
        _expanded: true,
        _dirty: true,
        _isNew: true,
        _error: 'Fill in all fields',
      },
    ])
  }

  const handleSave = async () => {
    setIsSaving(true)
    setSaveSuccess(false)
    try {
      // Update test metadata
      const { error: metaErr } = await supabase
        .from('pyq_tests')
        .update({
          title: meta.title.trim(),
          exam_name: meta.exam_name.trim(),
          year: meta.year ? parseInt(meta.year) : null,
          duration_minutes: parseInt(meta.duration_minutes) || 120,
          total_marks: parseInt(meta.total_marks) || 120,
          negative_marking: parseFloat(meta.negative_marking) || 0.25,
          instructions: meta.instructions.trim() || null,
          is_published: meta.is_published,
          updated_at: new Date().toISOString(),
        })
        .eq('id', testId)

      if (metaErr) throw metaErr

      // Upsert dirty/new questions
      const dirtyQuestions = questions
        .filter(q => q._dirty)
        .map((q, i) => ({
          id: q._isNew ? undefined : q.id,
          test_id: testId,
          order_index: questions.indexOf(q),
          passage: q.passage.trim() || null,
          question_text: q.question_text.trim(),
          option_a: q.option_a.trim(),
          option_b: q.option_b.trim(),
          option_c: q.option_c.trim(),
          option_d: q.option_d.trim(),
          correct_answer: q.correct_answer.toUpperCase(),
          explanation: q.explanation.trim() || null,
          marks: q.marks || 1,
        }))

      if (dirtyQuestions.length > 0) {
        const newOnes = dirtyQuestions.filter(q => !q.id).map(({ id, ...rest }) => rest)
        const existingOnes = dirtyQuestions.filter(q => q.id)

        if (newOnes.length > 0) {
          const { error: insErr } = await supabase.from('pyq_questions').insert(newOnes)
          if (insErr) throw insErr
        }

        for (const q of existingOnes) {
          const { id, ...rest } = q
          const { error: updErr } = await supabase.from('pyq_questions').update(rest).eq('id', id!)
          if (updErr) throw updErr
        }
      }

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
      await loadData() // refresh to get new IDs
    } catch (err: any) {
      alert(`Save failed: ${err.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
        <AlertCircle className="w-10 h-10 text-red-500" />
        <p className="text-destructive font-medium">{error}</p>
        <button onClick={loadData} className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg text-sm font-medium hover:bg-muted/80">
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    )
  }

  const errorCount = questions.filter(q => q._error).length
  const okCount = questions.length - errorCount

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/pyq">
          <button className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">{meta.title || 'Edit Test'}</h1>
          <p className="text-sm text-muted-foreground">{meta.exam_name}{meta.year ? ` · ${meta.year}` : ''} · {questions.length} questions</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setShowPasteModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-violet-600 border border-violet-300 rounded-xl hover:bg-violet-50 transition-colors"
          >
            <ClipboardPaste className="w-4 h-4" />
            Paste JSON
          </button>
          <Link
            href={`/admin/pyq/${testId}/preview`}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-primary border border-primary/30 rounded-xl hover:bg-primary/10 transition-colors"
          >
            <Eye className="w-4 h-4" />
            Preview Exam
          </Link>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-colors shadow-sm',
              saveSuccess
                ? 'bg-green-500 text-white'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            )}
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saveSuccess ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* ── Metadata ── */}
      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-bold text-foreground">Exam Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="md:col-span-2 xl:col-span-3">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Title *</label>
            <input
              type="text"
              value={meta.title}
              onChange={e => setMeta(m => ({ ...m, title: e.target.value }))}
              className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Exam Name</label>
            <input type="text" value={meta.exam_name} onChange={e => setMeta(m => ({ ...m, exam_name: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Year</label>
            <input type="number" value={meta.year} onChange={e => setMeta(m => ({ ...m, year: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Duration (min)</label>
            <input type="number" value={meta.duration_minutes} onChange={e => setMeta(m => ({ ...m, duration_minutes: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Total Marks</label>
            <input type="number" value={meta.total_marks} onChange={e => setMeta(m => ({ ...m, total_marks: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Negative Marking</label>
            <select value={meta.negative_marking} onChange={e => setMeta(m => ({ ...m, negative_marking: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40">
              <option value="0">None (0)</option>
              <option value="0.25">−0.25 per wrong</option>
              <option value="0.33">−0.33 per wrong</option>
              <option value="0.5">−0.5 per wrong</option>
              <option value="1">−1 per wrong</option>
            </select>
          </div>
          <div className="md:col-span-2 xl:col-span-2">
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Instructions</label>
            <textarea value={meta.instructions} onChange={e => setMeta(m => ({ ...m, instructions: e.target.value }))} rows={2} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
          </div>
          <div className="flex items-center gap-3 pt-5">
            <button
              type="button"
              onClick={() => setMeta(m => ({ ...m, is_published: !m.is_published }))}
              className={cn('relative inline-flex shrink-0 w-11 h-6 rounded-full transition-colors duration-200 cursor-pointer', meta.is_published ? 'bg-green-500' : 'bg-muted-foreground/30')}
            >
              <span className={cn('pointer-events-none inline-block w-5 h-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 my-0.5', meta.is_published ? 'translate-x-5' : 'translate-x-0.5')} />
            </button>
            <span className="text-sm font-medium text-foreground">{meta.is_published ? 'Published' : 'Draft'}</span>
          </div>
        </div>
      </div>

      {/* ── Questions ── */}
      <div className="space-y-3">
        {/* Summary */}
        <div className="flex items-center gap-4">
          <h2 className="font-bold text-foreground text-lg flex-1">Questions</h2>
          <div className="flex items-center gap-3 text-sm">
            <span className="flex items-center gap-1.5 text-green-600 font-semibold">
              <CheckCircle2 className="w-4 h-4" /> {okCount} valid
            </span>
            {errorCount > 0 && (
              <span className="flex items-center gap-1.5 text-amber-600 font-semibold">
                <AlertCircle className="w-4 h-4" /> {errorCount} issues
              </span>
            )}
          </div>
        </div>

        {questions.map((q, index) => (
          <div
            key={q.id}
            className={cn(
              'bg-card border rounded-xl overflow-hidden',
              q._error ? 'border-amber-300 dark:border-amber-700' : 'border-border',
              q._dirty && !q._error ? 'border-blue-300 dark:border-blue-700' : ''
            )}
          >
            {/* Header row */}
            <div
              className="flex items-center gap-3 p-4 cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => toggleExpand(index)}
            >
              <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
              <span className={cn(
                'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0',
                q._error ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 'bg-primary/10 text-primary'
              )}>
                {index + 1}
              </span>
              <p className="flex-1 text-sm text-foreground line-clamp-1 font-medium">
                {q.question_text || <span className="text-muted-foreground italic">Empty question</span>}
              </p>
              {q.correct_answer && (
                <span className="shrink-0 text-xs font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full dark:bg-green-900/40 dark:text-green-400">
                  {q.correct_answer}
                </span>
              )}
              {q._dirty && !q._isNew && (
                <span className="shrink-0 text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Modified
                </span>
              )}
              {q._error && (
                <span className="shrink-0 text-xs text-amber-600 font-medium flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> {q._error}
                </span>
              )}
              <button
                onClick={e => { e.stopPropagation(); removeQuestion(index) }}
                className="shrink-0 p-1.5 text-muted-foreground hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              {q._expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />}
            </div>

            {/* Editor */}
            {q._expanded && (
              <div className="px-4 pb-5 pt-1 border-t border-border space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Passage (optional)</label>
                  <textarea value={q.passage} onChange={e => updateQ(index, 'passage', e.target.value)} rows={3} placeholder="Common passage for comprehension questions..." className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Question Text *</label>
                  <textarea value={q.question_text} onChange={e => updateQ(index, 'question_text', e.target.value)} rows={3} className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(['option_a', 'option_b', 'option_c', 'option_d'] as const).map((field, fi) => (
                    <div key={field}>
                      <label className="block text-xs font-semibold text-muted-foreground mb-1">Option {['A', 'B', 'C', 'D'][fi]}</label>
                      <input type="text" value={q[field]} onChange={e => updateQ(index, field, e.target.value)} className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40" />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Correct Answer *</label>
                  <div className="flex gap-2">
                    {['A', 'B', 'C', 'D'].map(opt => (
                      <button
                        key={opt}
                        onClick={() => updateQ(index, 'correct_answer', opt)}
                        className={cn(
                          'w-12 h-10 rounded-lg font-bold text-sm transition-colors',
                          q.correct_answer === opt ? 'bg-green-500 text-white shadow-sm' : 'bg-muted text-muted-foreground hover:bg-muted-foreground/20'
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Explanation (optional)</label>
                  <textarea value={q.explanation} onChange={e => updateQ(index, 'explanation', e.target.value)} rows={2} placeholder="Why is this answer correct?" className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none" />
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Add question */}
        <button
          onClick={addBlankQuestion}
          className="w-full py-3 border-2 border-dashed border-border rounded-xl text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add another question
        </button>
      </div>

      {/* Floating save bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur-md border-t border-border p-4 flex items-center justify-between z-50">
        <div className="text-sm text-muted-foreground">
          <span className="font-bold text-foreground">{questions.length}</span> questions
          {questions.filter(q => q._dirty).length > 0 && (
            <span className="ml-2 text-blue-600">· {questions.filter(q => q._dirty).length} unsaved changes</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowPasteModal(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-violet-600 border border-violet-300 rounded-xl hover:bg-violet-50 transition-colors"
          >
            <ClipboardPaste className="w-4 h-4" />
            Paste JSON
          </button>
          <Link
            href={`/admin/pyq/${testId}/preview`}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-primary border border-primary/30 rounded-xl hover:bg-primary/10 transition-colors"
          >
            <Eye className="w-4 h-4" />
            Preview
          </Link>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className={cn(
              'flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm transition-colors shadow-sm',
              saveSuccess ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
            )}
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saveSuccess ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* ── JSON Paste Modal ── */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] z-50">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
              <div>
                <h2 className="font-bold text-foreground text-lg">Paste Questions JSON</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Passages carry over to consecutive questions automatically</p>
              </div>
              <button onClick={() => { setShowPasteModal(false); setPasteRaw(''); setPastePreview([]); setPasteError('') }} className="p-1.5 hover:bg-muted rounded-lg">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* Format tip */}
            <div className="mx-6 mt-4 p-3 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-xl text-xs text-violet-700 dark:text-violet-300 flex gap-2 shrink-0">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <strong>Smart Passage Support:</strong> Use <code className="bg-violet-100 dark:bg-violet-900 px-1 rounded">passage_text</code> for the first question in a group. 
                Following questions with the same <code className="bg-violet-100 dark:bg-violet-900 px-1 rounded">passage_group</code> will inherit it. 
                Set <code className="bg-violet-100 dark:bg-violet-900 px-1 rounded">"passage_group": null</code> to end a group.
              </div>
            </div>

            {/* Textarea */}
            <div className="px-6 pt-4 flex-1 overflow-hidden flex flex-col">
              <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">JSON Array</label>
              <textarea
                value={pasteRaw}
                onChange={e => { setPasteRaw(e.target.value); if (e.target.value.trim()) parsePastedJSON(e.target.value) }}
                rows={10}
                placeholder={`[
  {
    "passage_group": "P1",
    "passage_text": "The full passage text here...",
    "question_text": "First question of group P1",
    "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...",
    "correct_answer": "A"
  },
  {
    "passage_group": "P1",
    "passage_text": "",
    "question_text": "Second question of same group (inherits passage)",
    ...
  },
  {
    "passage_group": null,
    "passage_text": "",
    "question_text": "A standalone question (ends passage group)",
    ...
  }
]`}
                className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none flex-1"
              />
              {pasteError && (
                <p className="mt-2 text-xs text-red-600 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> {pasteError}
                </p>
              )}
            </div>

            {/* Preview */}
            {pastePreview.length > 0 && (
              <div className="mx-6 mt-3 p-3 bg-muted/50 rounded-xl max-h-40 overflow-y-auto shrink-0">
                <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">
                  Preview — {pastePreview.length} questions detected
                </p>
                <div className="space-y-1.5">
                  {pastePreview.map((q, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className={cn(
                        'w-5 h-5 rounded flex items-center justify-center font-bold shrink-0',
                        q._error ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                      )}>
                        {i + 1}
                      </span>
                      <span className="flex-1 text-foreground line-clamp-1">{q.question_text || <em className="text-muted-foreground">empty</em>}</span>
                      {q.passage && (
                        <span className="shrink-0 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">
                          📖 passage
                        </span>
                      )}
                      {q.correct_answer && (
                        <span className="shrink-0 text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                          {q.correct_answer}
                        </span>
                      )}
                      {q._error && (
                        <span className="shrink-0 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                          ⚠ {q._error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 px-6 py-4 border-t border-border shrink-0">
              <button
                onClick={() => { setShowPasteModal(false); setPasteRaw(''); setPastePreview([]); setPasteError('') }}
                className="flex-1 py-2.5 border border-border rounded-xl font-semibold text-sm text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmPaste}
                disabled={pastePreview.length === 0 || !!pasteError}
                className="flex-1 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add {pastePreview.length > 0 ? `${pastePreview.length} Questions` : 'Questions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
