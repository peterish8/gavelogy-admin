'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Eye,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Unlink,
} from 'lucide-react'

import { useQuery, useMutation } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { cn } from '@/lib/utils'
import { DeletePyqButton } from '@/app/admin/pyq/delete-pyq-button'
import {
  buildDraftFromDb,
  buildPyqReviewText,
  ensureQuestionsLinkedToPassages,
  getPassageSummary,
  getNextPassageId,
  getNextQuestionId,
  parsePyqJson,
  PYQ_AI_SYSTEM_PROMPT,
  type PyqDraftBundle,
  type PyqPassageDraft,
  type PyqQuestionDraft,
  validatePassageDraft,
  validateQuestionDraft,
} from '@/lib/pyq-normalized'

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

const EMPTY_BUNDLE: PyqDraftBundle = { passages: [], questions: [] }

export default function PYQEditPage() {
  const params = useParams()
  const testId = params.testId as Id<'pyq_tests'>

  const testDoc = useQuery(api.pyq.getPyqTest, { testId })
  const passageDocs = useQuery(api.pyq.getPyqPassages, { testId })
  const questionDocs = useQuery(api.pyq.getPyqQuestions, { testId })
  const saveBundleMutation = useMutation(api.pyq.savePyqBundle)

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
  const [bundle, setBundle] = useState<PyqDraftBundle>(EMPTY_BUNDLE)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState('')
  const [showPasteModal, setShowPasteModal] = useState(false)
  const [pasteRaw, setPasteRaw] = useState('')
  const [pasteError, setPasteError] = useState('')
  const [promptCopied, setPromptCopied] = useState(false)
  const [qaCopied, setQaCopied] = useState(false)

  const questionErrors = useMemo(
    () => bundle.questions.map((question) => validateQuestionDraft(question)),
    [bundle.questions]
  )
  const passageErrors = useMemo(
    () => bundle.passages.map((passage) => validatePassageDraft(passage)),
    [bundle.passages]
  )
  const invalidCount = questionErrors.filter(Boolean).length + passageErrors.filter(Boolean).length
  const standaloneCount = bundle.questions.filter((question) => !question.passage_id).length
  const passageSummary = getPassageSummary(bundle)

  const [initialized, setInitialized] = useState(false)

  useEffect(() => {
    if (!initialized && testDoc !== undefined && passageDocs !== undefined && questionDocs !== undefined) {
      if (!testDoc) { setError('Test not found'); setIsLoading(false); return }
      setMeta({
        title: testDoc.title || '',
        exam_name: testDoc.exam_name || 'CLAT PG',
        year: testDoc.year?.toString() || '',
        duration_minutes: testDoc.duration_minutes?.toString() || '120',
        total_marks: testDoc.total_marks?.toString() || '120',
        negative_marking: testDoc.negative_marking?.toString() || '0.25',
        instructions: testDoc.instructions || '',
        is_published: testDoc.is_published || false,
      })
      setBundle(ensureQuestionsLinkedToPassages(buildDraftFromDb(
        (passageDocs || []).map((p: any) => ({ ...p, id: p._id })),
        (questionDocs || []).map((q: any) => ({ ...q, id: q._id, passage_id: q.passage_id ?? null }))
      )))
      setInitialized(true)
      setIsLoading(false)
    }
  }, [testDoc, passageDocs, questionDocs, initialized])

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(PYQ_AI_SYSTEM_PROMPT)
    setPromptCopied(true)
    setTimeout(() => setPromptCopied(false), 3000)
  }

  const copyReview = async () => {
    await navigator.clipboard.writeText(buildPyqReviewText(bundle))
    setQaCopied(true)
    setTimeout(() => setQaCopied(false), 3000)
  }

  const updatePassage = (index: number, field: keyof PyqPassageDraft, value: string | boolean) => {
    setBundle((prev) => {
      const passages = [...prev.passages]
      passages[index] = {
        ...passages[index],
        [field]: typeof value === 'string' ? value : value,
      }
      return { ...prev, passages }
    })
  }

  const updateQuestion = (index: number, field: keyof PyqQuestionDraft, value: string | boolean | null) => {
    setBundle((prev) => {
      const questions = [...prev.questions]
      questions[index] = {
        ...questions[index],
        [field]: field === 'passage_id'
          ? value
          : typeof value === 'string'
            ? value
            : value == null
              ? ''
              : value,
      }
      return ensureQuestionsLinkedToPassages({ ...prev, questions })
    })
  }

  const addPassage = () => {
    setBundle((prev) => ({
      ...prev,
      passages: [
        ...prev.passages,
        {
          client_passage_id: getNextPassageId(prev.passages),
          section: '',
          passage_text: '',
          passage_citation: '',
          subject: '',
          _expanded: true,
        },
      ],
    }))
  }

  const addQuestion = () => {
    setBundle((prev) => ({
      ...prev,
      questions: [
        ...prev.questions,
        {
          client_question_id: getNextQuestionId(prev.questions),
          passage_id: prev.passages[Math.min(Math.floor(prev.questions.length / 5), Math.max(prev.passages.length - 1, 0))]?.client_passage_id || prev.passages[0]?.client_passage_id || null,
          question_text: '',
          option_a: '',
          option_b: '',
          option_c: '',
          option_d: '',
          correct_answer: '',
          explanation: '',
          question_type: 'mcq',
          subject: '',
          _expanded: true,
        },
      ],
    }))
  }

  const removePassage = (index: number) => {
    setBundle((prev) => {
      const removed = prev.passages[index]
      const passages = prev.passages.filter((_, i) => i !== index)
      const questions = prev.questions.map((question) => (
        question.passage_id === removed.client_passage_id ? { ...question, passage_id: null } : question
      ))
      return ensureQuestionsLinkedToPassages({ passages, questions })
    })
  }

  const removeQuestion = (index: number) => {
    setBundle((prev) => ({ ...prev, questions: prev.questions.filter((_, i) => i !== index) }))
  }

  const parsePaste = (raw: string) => {
    setPasteError('')
    if (!raw.trim()) return
    try {
      const parsed = parsePyqJson(raw)
      setBundle((prev) => {
        const passageIdMap = new Map<string, string>()
        const existingPassages = [...prev.passages]
        const nextPassages = parsed.passages.map((passage) => {
          const nextId = getNextPassageId([...existingPassages, ...Array.from(passageIdMap.values()).map((id) => ({ client_passage_id: id }))])
          passageIdMap.set(passage.client_passage_id, nextId)
          return { ...passage, client_passage_id: nextId }
        })

        let nextQuestionNumber = prev.questions.reduce((max, question) => {
          const match = question.client_question_id.match(/^Q(\d+)$/i)
          return match ? Math.max(max, parseInt(match[1], 10)) : max
        }, 0)
        const nextQuestions = parsed.questions.map((question) => {
          nextQuestionNumber += 1
          return {
            ...question,
            client_question_id: `Q${nextQuestionNumber}`,
            passage_id: question.passage_id ? (passageIdMap.get(question.passage_id) || null) : null,
          }
        })

        return ensureQuestionsLinkedToPassages({
          passages: [...prev.passages, ...nextPassages],
          questions: [...prev.questions, ...nextQuestions],
        })
      })
      setPasteRaw('')
      setShowPasteModal(false)
    } catch (e: any) {
      setPasteError(e.message || 'Invalid JSON')
    }
  }

  const handleSave = async () => {
    if (!meta.title.trim()) {
      alert('Enter a test title.')
      return
    }
    if (bundle.questions.length === 0) {
      alert('Add at least one question.')
      return
    }
    if (invalidCount > 0) {
      alert('Fix the validation errors before saving.')
      return
    }

    setIsSaving(true)
    setSaveSuccess(false)
    try {
      await saveBundleMutation({
        testId,
        testMeta: {
          title: meta.title.trim(),
          exam_name: meta.exam_name.trim(),
          year: meta.year ? parseInt(meta.year, 10) : undefined,
          duration_minutes: parseInt(meta.duration_minutes, 10) || 120,
          total_marks: parseInt(meta.total_marks, 10) || 120,
          negative_marking: parseFloat(meta.negative_marking) || 0.25,
          instructions: meta.instructions.trim() || undefined,
          is_published: meta.is_published,
        },
        passages: bundle.passages.map((passage, index) => ({
          client_passage_id: passage.client_passage_id,
          passage_text: passage.passage_text.trim(),
          citation: passage.passage_citation.trim() || undefined,
          section_number: passage.section.trim() || undefined,
          subject: passage.subject.trim() || undefined,
          order_index: index,
        })),
        questions: bundle.questions.map((question, index) => ({
          client_passage_id: question.passage_id ?? undefined,
          question_text: question.question_text.trim(),
          option_a: question.option_a.trim() || undefined,
          option_b: question.option_b.trim() || undefined,
          option_c: question.option_c.trim() || undefined,
          option_d: question.option_d.trim() || undefined,
          correct_answer: question.correct_answer || undefined,
          explanation: question.explanation.trim() || undefined,
          marks: 1,
          question_type: question.question_type.trim() || 'mcq',
          subject: question.subject.trim() || undefined,
          order_index: index,
        })),
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (e: any) {
      alert(`Save failed: ${e.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return <div className="flex items-center justify-center h-[60vh]"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center gap-4">
        <AlertCircle className="w-10 h-10 text-red-500" />
        <p className="text-destructive font-medium">{error}</p>
        <button onClick={() => window.location.reload()} className="flex items-center gap-2 px-4 py-2 bg-muted rounded-lg text-sm font-medium">
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center gap-4">
        <Link href="/admin/pyq">
          <button className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-foreground truncate">{meta.title || 'Edit Test'}</h1>
          <p className="text-sm text-muted-foreground">{meta.exam_name}{meta.year ? ` · ${meta.year}` : ''} · {bundle.questions.length} questions</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={copyPrompt} className={cn('flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl border', promptCopied ? 'bg-green-500 text-white border-green-500' : 'text-amber-600 border-amber-300')}>
            {promptCopied ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            {promptCopied ? 'Prompt Copied!' : 'AI Prompt'}
          </button>
          <button onClick={() => setShowPasteModal(true)} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-violet-600 border border-violet-300 rounded-xl">
            <ClipboardPaste className="w-4 h-4" />
            Paste JSON
          </button>
          <DeletePyqButton
            testId={testId}
            testTitle={meta.title || 'this test'}
            variant="header"
            onDeletedRedirectTo="/admin/pyq"
          />
          <Link href={`/admin/pyq/${testId}/preview`} className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-primary border border-primary/30 rounded-xl">
            <Eye className="w-4 h-4" />
            Preview Exam
          </Link>
          <button onClick={handleSave} disabled={isSaving} className={cn('flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm', saveSuccess ? 'bg-green-500 text-white' : 'bg-primary text-primary-foreground')}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {saveSuccess ? 'Saved!' : 'Save Changes'}
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-bold text-foreground">Exam Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="md:col-span-2 xl:col-span-3">
            <input value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm" placeholder="Title" />
          </div>
          <input value={meta.exam_name} onChange={(e) => setMeta((m) => ({ ...m, exam_name: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm" placeholder="Exam name" />
          <input type="number" value={meta.year} onChange={(e) => setMeta((m) => ({ ...m, year: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm" placeholder="Year" />
          <input type="number" value={meta.duration_minutes} onChange={(e) => setMeta((m) => ({ ...m, duration_minutes: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm" placeholder="Duration" />
          <input type="number" value={meta.total_marks} onChange={(e) => setMeta((m) => ({ ...m, total_marks: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm" placeholder="Total marks" />
          <input value={meta.negative_marking} onChange={(e) => setMeta((m) => ({ ...m, negative_marking: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm" placeholder="Negative marking" />
          <div className="md:col-span-2 xl:col-span-3">
            <textarea value={meta.instructions} onChange={(e) => setMeta((m) => ({ ...m, instructions: e.target.value }))} rows={3} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm resize-none" placeholder="Instructions" />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={meta.is_published} onChange={(e) => setMeta((m) => ({ ...m, is_published: e.target.checked }))} />
            Published
          </label>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 text-green-600 font-semibold text-sm"><CheckCircle2 className="w-4 h-4" />{bundle.questions.length - questionErrors.filter(Boolean).length} valid questions</div>
        <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm"><BookOpen className="w-4 h-4" />{bundle.passages.length} passages</div>
        <div className="flex items-center gap-2 text-slate-500 font-semibold text-sm"><Unlink className="w-4 h-4" />{standaloneCount} standalone</div>
        {invalidCount > 0 && <div className="flex items-center gap-2 text-amber-600 font-semibold text-sm"><AlertCircle className="w-4 h-4" />{invalidCount} issues</div>}
        <div className="ml-auto flex items-center gap-2">
          <button onClick={copyReview} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-sm', qaCopied ? 'bg-green-500 text-white border-green-500' : 'border-border text-muted-foreground')}>
            {qaCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {qaCopied ? 'Copied!' : 'Copy Q&A'}
          </button>
          <button onClick={addPassage} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium"><Plus className="w-4 h-4" /> Passage</button>
          <button onClick={addQuestion} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium"><Plus className="w-4 h-4" /> Question</button>
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground">Passages</h2>
        {bundle.passages.map((passage, index) => (
          <div key={passage.client_passage_id} className="bg-card border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3">
              <span className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-bold">{passage.client_passage_id}</span>
              <span className="text-sm text-muted-foreground">{passageSummary.find((item) => item.client_passage_id === passage.client_passage_id)?.count || 0} linked questions</span>
              {passageErrors[index] && <span className="text-xs text-amber-600">{passageErrors[index]}</span>}
              <button onClick={() => removePassage(index)} className="ml-auto p-2 text-muted-foreground hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input value={passage.section} onChange={(e) => updatePassage(index, 'section', e.target.value)} placeholder="Section" className="px-3 py-2 bg-background border border-input rounded-lg text-sm" />
              <input value={passage.subject} onChange={(e) => updatePassage(index, 'subject', e.target.value)} placeholder="Subject" className="px-3 py-2 bg-background border border-input rounded-lg text-sm" />
              <input value={passage.passage_citation} onChange={(e) => updatePassage(index, 'passage_citation', e.target.value)} placeholder="Citation" className="px-3 py-2 bg-background border border-input rounded-lg text-sm" />
            </div>
            <textarea value={passage.passage_text} onChange={(e) => updatePassage(index, 'passage_text', e.target.value)} rows={5} placeholder="Full passage text" className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm resize-none" />
          </div>
        ))}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-bold text-foreground">Questions</h2>
        {bundle.questions.map((question, index) => (
          <div key={question.client_question_id} className="bg-card border border-border rounded-xl p-4 space-y-3">
            {(() => {
              const linkedPassage = question.passage_id
                ? bundle.passages.find((passage) => passage.client_passage_id === question.passage_id)
                : null

              return (
                <>
            <div className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg bg-primary/10 text-primary text-xs font-bold flex items-center justify-center">{index + 1}</span>
              {questionErrors[index] && <span className="text-xs text-amber-600">{questionErrors[index]}</span>}
              <button onClick={() => removeQuestion(index)} className="ml-auto p-2 text-muted-foreground hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select value={question.passage_id || ''} onChange={(e) => updateQuestion(index, 'passage_id', e.target.value || null)} className="px-3 py-2 bg-background border border-input rounded-lg text-sm">
                {bundle.passages.map((passage) => (
                  <option key={passage.client_passage_id} value={passage.client_passage_id}>
                    {passage.client_passage_id}{passage.section ? ` · Sec ${passage.section}` : ''}{passage.subject ? ` · ${passage.subject}` : ''}
                  </option>
                ))}
              </select>
              <input value={question.subject} onChange={(e) => updateQuestion(index, 'subject', e.target.value)} placeholder="Subject" className="px-3 py-2 bg-background border border-input rounded-lg text-sm" />
              <input value={question.question_type} onChange={(e) => updateQuestion(index, 'question_type', e.target.value)} placeholder="Question type" className="px-3 py-2 bg-background border border-input rounded-lg text-sm" />
            </div>
            <details
              className={cn(
                'rounded-xl border px-4 py-3',
                linkedPassage ? 'border-blue-200 bg-blue-50/70' : 'border-dashed border-slate-200 bg-slate-50'
              )}
              open={false}
            >
              <summary className={cn(
                'cursor-pointer text-sm font-semibold',
                linkedPassage ? 'text-blue-700' : 'text-slate-500'
              )}>
                {linkedPassage ? `Show full passage ${linkedPassage.client_passage_id}` : 'No passage linked yet'}
              </summary>
              <div className="mt-3 space-y-2">
                {linkedPassage ? (
                  <>
                    {(linkedPassage.section || linkedPassage.subject || linkedPassage.passage_citation) && (
                      <div className="flex flex-wrap gap-2 text-xs">
                        {linkedPassage.section && <span className="rounded-full bg-white px-2 py-1 text-blue-700 border border-blue-200">Section {linkedPassage.section}</span>}
                        {linkedPassage.subject && <span className="rounded-full bg-white px-2 py-1 text-blue-700 border border-blue-200">{linkedPassage.subject}</span>}
                      </div>
                    )}
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{linkedPassage.passage_text}</p>
                    {linkedPassage.passage_citation && (
                      <p className="text-xs italic text-slate-500">{linkedPassage.passage_citation}</p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500">
                    Create or assign a passage first. Every question in this paper should belong to a passage.
                  </p>
                )}
              </div>
            </details>
            <textarea value={question.question_text} onChange={(e) => updateQuestion(index, 'question_text', e.target.value)} rows={3} placeholder="Question text" className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm resize-none" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {([
                ['option_a', 'Option A'],
                ['option_b', 'Option B'],
                ['option_c', 'Option C'],
                ['option_d', 'Option D'],
              ] as const).map(([field, label]) => (
                <input key={field} value={question[field]} onChange={(e) => updateQuestion(index, field, e.target.value)} placeholder={label} className="px-3 py-2 bg-background border border-input rounded-lg text-sm" />
              ))}
            </div>
            <div className="flex items-center gap-2">
              {['A', 'B', 'C', 'D'].map((option) => (
                <button key={option} onClick={() => updateQuestion(index, 'correct_answer', option)} className={cn('w-12 h-10 rounded-lg font-bold text-sm', question.correct_answer === option ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground')}>
                  {option}
                </button>
              ))}
            </div>
            <textarea value={question.explanation} onChange={(e) => updateQuestion(index, 'explanation', e.target.value)} rows={2} placeholder="Explanation" className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm resize-none" />
                </>
              )
            })()}
          </div>
        ))}
      </div>

      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-foreground text-lg">Paste Normalized JSON</h2>
                <p className="text-xs text-muted-foreground">Paste the same passages + questions object returned by the parser.</p>
              </div>
              <button onClick={() => { setShowPasteModal(false); setPasteRaw(''); setPasteError('') }} className="text-sm text-muted-foreground">Close</button>
            </div>
            <textarea value={pasteRaw} onChange={(e) => setPasteRaw(e.target.value)} rows={14} placeholder='{"passages":[...],"questions":[...]}' className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-xs font-mono resize-none" />
            {pasteError && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="w-3.5 h-3.5" /> {pasteError}</p>}
            <div className="flex gap-3">
              <button onClick={() => { setShowPasteModal(false); setPasteRaw(''); setPasteError('') }} className="flex-1 py-2.5 border border-border rounded-xl font-semibold text-sm text-muted-foreground">Cancel</button>
              <button onClick={() => parsePaste(pasteRaw)} className="flex-1 py-2.5 bg-violet-600 text-white rounded-xl font-bold text-sm">Import JSON</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
