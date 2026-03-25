'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  FileUp,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Unlink,
  Wand2,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import {
  buildPyqReviewText,
  ensureQuestionsLinkedToPassages,
  getPassageSummary,
  getNextPassageId,
  getNextQuestionId,
  parsePyqInput,
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
  const [bundle, setBundle] = useState<PyqDraftBundle>(EMPTY_BUNDLE)
  const [pasteText, setPasteText] = useState('')
  const [parseError, setParseError] = useState('')
  const [uploadError, setUploadError] = useState('')
  const [isUploading, setIsUploading] = useState<false | 'extracting' | 'analyzing'>(false)
  const [isSaving, setIsSaving] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const [qaCopied, setQaCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'input' | 'questions'>('input')
  const [inputMode, setInputMode] = useState<'pdf' | 'ai-paste' | 'manual'>('pdf')

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

  const applyBundle = (nextBundle: PyqDraftBundle) => {
    const normalizedBundle = ensureQuestionsLinkedToPassages(nextBundle)
    setBundle({
      passages: normalizedBundle.passages.map((passage) => ({ ...passage, _expanded: false })),
      questions: normalizedBundle.questions.map((question) => ({ ...question, _expanded: false })),
    })
    setActiveTab('questions')
  }

  const handleParse = () => {
    setParseError('')
    if (!pasteText.trim()) {
      setParseError('Paste some text first.')
      return
    }
    try {
      applyBundle(parsePyqInput(pasteText))
    } catch (e: any) {
      setParseError(`Parse error: ${e.message}`)
    }
  }

  const handlePDFUpload = async (file: File) => {
    setUploadError('')
    setIsUploading('extracting')

    try {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise

      let fullText = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        fullText += `\n${textContent.items.map((item: any) => item.str).join(' ')}`
      }

      if (!fullText.trim()) {
        throw new Error('Could not extract text from this PDF. It may be scanned.')
      }

      setIsUploading('analyzing')
      const res = await fetch('/api/pyq/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfText: fullText, fileName: file.name }),
      })

      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'AI parsing failed')

      applyBundle({
        passages: data.passages || [],
        questions: data.questions || [],
      })

      if (data.truncated) {
        setUploadError(`PDF text was truncated. Parsed ${data.count} questions and ${data.passage_count} passages.`)
      }
    } catch (e: any) {
      setUploadError(e.message || 'Upload failed')
    } finally {
      setIsUploading(false)
    }
  }

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

  const updatePassage = (index: number, field: keyof PyqPassageDraft, value: string | boolean) => {
    setBundle((prev) => {
      const passages = [...prev.passages]
      passages[index] = { ...passages[index], [field]: value }
      return { ...prev, passages }
    })
  }

  const updateQuestion = (index: number, field: keyof PyqQuestionDraft, value: string | boolean | null) => {
    setBundle((prev) => {
      const questions = [...prev.questions]
      questions[index] = { ...questions[index], [field]: value }
      return ensureQuestionsLinkedToPassages({ ...prev, questions })
    })
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
      alert('Fix the passage/question validation errors before saving.')
      return
    }

    setIsSaving(true)
    try {
      const { data: test, error: testErr } = await supabase
        .from('pyq_tests')
        .insert({
          title: meta.title.trim(),
          exam_name: meta.exam_name.trim(),
          year: meta.year ? parseInt(meta.year, 10) : null,
          duration_minutes: parseInt(meta.duration_minutes, 10) || 120,
          total_marks: parseInt(meta.total_marks, 10) || 120,
          negative_marking: parseFloat(meta.negative_marking) || 0.25,
          instructions: meta.instructions.trim() || null,
          is_published: meta.is_published,
        })
        .select('id')
        .single()

      if (testErr || !test) throw new Error(testErr?.message || 'Failed to create test')

      const passageIdMap = new Map<string, string>()
      if (bundle.passages.length > 0) {
        const passageRows = bundle.passages.map((passage, index) => ({
          test_id: test.id,
          order_index: index,
          passage_text: passage.passage_text.trim(),
          citation: passage.passage_citation.trim() || null,
          section_number: passage.section.trim() || null,
          subject: passage.subject.trim() || null,
        }))
        const { data: insertedPassages, error: passageErr } = await supabase
          .from('pyq_passages')
          .insert(passageRows)
          .select('id')

        if (passageErr) throw new Error(passageErr.message)
        insertedPassages?.forEach((row: any, index: number) => {
          passageIdMap.set(bundle.passages[index].client_passage_id, row.id)
        })
      }

      const questionRows = bundle.questions.map((question, index) => ({
        test_id: test.id,
        order_index: index,
        passage_id: question.passage_id ? (passageIdMap.get(question.passage_id) || null) : null,
        question_text: question.question_text.trim(),
        option_a: question.option_a.trim(),
        option_b: question.option_b.trim(),
        option_c: question.option_c.trim(),
        option_d: question.option_d.trim(),
        correct_answer: question.correct_answer,
        explanation: question.explanation.trim() || null,
        marks: 1,
        question_type: question.question_type.trim() || 'mcq',
        subject: question.subject.trim() || null,
      }))
      const { error: questionErr } = await supabase.from('pyq_questions').insert(questionRows)
      if (questionErr) throw new Error(questionErr.message)

      router.push(`/admin/pyq/${test.id}/edit`)
    } catch (e: any) {
      alert(`Save failed: ${e.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center gap-4">
        <Link href="/admin/pyq">
          <button className="p-2 hover:bg-muted rounded-lg text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">New PYQ Mock Test</h1>
          <p className="text-sm text-muted-foreground">Normalized passages + questions flow</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyPrompt}
            className={cn(
              'flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl border transition-colors',
              promptCopied ? 'bg-green-500 text-white border-green-500' : 'text-amber-600 border-amber-300 hover:bg-amber-50'
            )}
          >
            {promptCopied ? <Check className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
            {promptCopied ? 'Prompt Copied!' : 'AI Prompt'}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || bundle.questions.length === 0 || !meta.title}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-semibold shadow-sm hover:bg-primary/90 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Test
          </button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6 space-y-4">
        <h2 className="font-bold text-foreground text-lg">Exam Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="md:col-span-2 xl:col-span-3">
            <label className="block text-sm font-medium text-foreground mb-1.5">Test Title *</label>
            <input value={meta.title} onChange={(e) => setMeta((m) => ({ ...m, title: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Exam Name</label>
            <input value={meta.exam_name} onChange={(e) => setMeta((m) => ({ ...m, exam_name: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Year</label>
            <input type="number" value={meta.year} onChange={(e) => setMeta((m) => ({ ...m, year: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Duration</label>
            <input type="number" value={meta.duration_minutes} onChange={(e) => setMeta((m) => ({ ...m, duration_minutes: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Total Marks</label>
            <input type="number" value={meta.total_marks} onChange={(e) => setMeta((m) => ({ ...m, total_marks: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground mb-1.5">Negative Marking</label>
            <input value={meta.negative_marking} onChange={(e) => setMeta((m) => ({ ...m, negative_marking: e.target.value }))} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm" />
          </div>
          <div className="md:col-span-2 xl:col-span-3">
            <label className="block text-sm font-medium text-foreground mb-1.5">Instructions</label>
            <textarea value={meta.instructions} onChange={(e) => setMeta((m) => ({ ...m, instructions: e.target.value }))} rows={3} className="w-full px-3 py-2.5 bg-background border border-input rounded-lg text-sm resize-none" />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <input type="checkbox" checked={meta.is_published} onChange={(e) => setMeta((m) => ({ ...m, is_published: e.target.checked }))} />
            Published
          </label>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border">
        {(['input', 'questions'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn('px-4 py-2 text-sm font-semibold border-b-2 transition-colors', activeTab === tab ? 'border-primary text-primary' : 'border-transparent text-muted-foreground')}
          >
            {tab === 'input' ? 'Add Questions' : 'Review Draft'}
          </button>
        ))}
      </div>

      {activeTab === 'input' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(['pdf', 'ai-paste', 'manual'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setInputMode(mode)}
                className={cn('px-4 py-2 rounded-xl text-sm font-semibold border', inputMode === mode ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground')}
              >
                {mode === 'pdf' ? 'Upload PDF' : mode === 'ai-paste' ? 'Paste AI JSON' : 'Manual Text'}
              </button>
            ))}
          </div>

          {inputMode === 'pdf' && (
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <p className="text-sm text-muted-foreground">Upload a PDF and the parser will return separate passages and questions.</p>
              <input ref={fileInputRef} type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && handlePDFUpload(e.target.files[0])} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold">
                {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                {isUploading === 'extracting' ? 'Extracting PDF...' : isUploading === 'analyzing' ? 'Analyzing...' : 'Choose PDF'}
              </button>
              {uploadError && <div className="text-sm text-amber-600 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{uploadError}</div>}
            </div>
          )}

          {(inputMode === 'ai-paste' || inputMode === 'manual') && (
            <div className="bg-card border border-border rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">{inputMode === 'ai-paste' ? 'Paste the normalized AI JSON object here.' : 'Paste plain question text here.'}</p>
                {inputMode === 'ai-paste' && (
                  <button onClick={copyPrompt} className="text-sm font-medium text-amber-600 hover:text-amber-700">
                    Copy AI prompt
                  </button>
                )}
              </div>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={16}
                placeholder={inputMode === 'ai-paste'
                  ? '{\n  "passages": [...],\n  "questions": [...]\n}'
                  : '1. Question...\n(a) ...\n(b) ...\nAnswer: A'}
                className="w-full px-4 py-3 bg-background border border-input rounded-lg text-sm font-mono resize-y"
              />
              {parseError && <div className="text-sm text-red-600 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{parseError}</div>}
              <button onClick={handleParse} disabled={!pasteText.trim()} className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-bold disabled:opacity-50">
                <Wand2 className="w-4 h-4" />
                Parse Input
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'questions' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-4 bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 text-green-600 font-semibold text-sm">
              <CheckCircle2 className="w-4 h-4" />
              {bundle.questions.length - questionErrors.filter(Boolean).length} valid questions
            </div>
            <div className="flex items-center gap-2 text-blue-600 font-semibold text-sm">
              <BookOpen className="w-4 h-4" />
              {bundle.passages.length} passages
            </div>
            <div className="flex items-center gap-2 text-slate-500 font-semibold text-sm">
              <Unlink className="w-4 h-4" />
              {standaloneCount} standalone
            </div>
            {invalidCount > 0 && <div className="flex items-center gap-2 text-amber-600 font-semibold text-sm"><AlertCircle className="w-4 h-4" />{invalidCount} issues</div>}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={copyReview} className={cn('flex items-center gap-2 px-3 py-2 rounded-lg border text-sm', qaCopied ? 'bg-green-500 text-white border-green-500' : 'border-border text-muted-foreground')}>
                {qaCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {qaCopied ? 'Copied!' : 'Copy Q&A'}
              </button>
              <button onClick={addPassage} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium">
                <Plus className="w-4 h-4" /> Passage
              </button>
              <button onClick={addQuestion} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-sm font-medium">
                <Plus className="w-4 h-4" /> Question
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-bold text-foreground">Passages</h2>
            {bundle.passages.length === 0 && (
              <div className="bg-card border border-dashed border-border rounded-xl p-5 text-sm text-muted-foreground">No passages yet. Standalone questions are still supported.</div>
            )}
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
                    <input
                      key={field}
                      value={question[field]}
                      onChange={(e) => updateQuestion(index, field, e.target.value)}
                      placeholder={label}
                      className="px-3 py-2 bg-background border border-input rounded-lg text-sm"
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {['A', 'B', 'C', 'D'].map((option) => (
                    <button
                      key={option}
                      onClick={() => updateQuestion(index, 'correct_answer', option)}
                      className={cn('w-12 h-10 rounded-lg font-bold text-sm', question.correct_answer === option ? 'bg-green-500 text-white' : 'bg-muted text-muted-foreground')}
                    >
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
        </div>
      )}
    </div>
  )
}
