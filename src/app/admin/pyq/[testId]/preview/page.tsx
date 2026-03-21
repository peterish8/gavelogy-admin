'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Eye,
  RotateCcw,
  Flag,
  Info,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Passage {
  id: string
  passage_text: string
  order_index: number
}

interface Question {
  id: string
  order_index: number
  passage_id: string | null
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: string
  explanation: string | null
}

interface TestData {
  id: string
  title: string
  exam_name: string
  year: number | null
  duration_minutes: number
  total_marks: number
  negative_marking: number
  instructions: string | null
}

type QuestionStatus = 'unattempted' | 'answered' | 'marked' | 'answered-marked' | 'not-answered'

interface AnswerState {
  selected: string
  status: QuestionStatus
}

type ExamPhase = 'instructions' | 'active' | 'submitted'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  return `${String(h).padStart(2, '0')} : ${String(m).padStart(2, '0')} : ${String(s).padStart(2, '0')}`
}

const OPTION_LABELS = ['A', 'B', 'C', 'D'] as const
const OPTION_FIELDS: Record<string, keyof Question> = {
  A: 'option_a', B: 'option_b', C: 'option_c', D: 'option_d',
}

// ─── Question palette tile color ─────────────────────────────────────────────
function paletteColor(status: QuestionStatus, isCurrent: boolean) {
  if (isCurrent) return 'bg-blue-600 text-white border-blue-600'
  switch (status) {
    case 'answered': return 'bg-green-100 text-green-700 border-green-300'
    case 'marked': return 'bg-purple-100 text-purple-700 border-purple-300'
    case 'answered-marked': return 'bg-orange-100 text-orange-700 border-orange-300'
    case 'not-answered': return 'bg-red-100 text-red-600 border-red-300'
    default: return 'bg-gray-100 text-gray-600 border-gray-300 hover:bg-gray-200'
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PYQPreviewPage() {
  const params = useParams()
  const router = useRouter()
  const testId = params.testId as string
  const supabase = createClient()

  // Data
  const [test, setTest] = useState<TestData | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [passageMap, setPassageMap] = useState<Record<string, string>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  // Exam state
  const [phase, setPhase] = useState<ExamPhase>('instructions')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, AnswerState>>({})
  const [timeLeft, setTimeLeft] = useState(0)
  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [reviewIndex, setReviewIndex] = useState<number | null>(null)
  const [showCorrectAnswers, setShowCorrectAnswers] = useState(false)

  // Live clock
  const [liveTime, setLiveTime] = useState('')

  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    ;(async () => {
      try {
        const [{ data: t, error: te }, { data: qs, error: qe }, { data: ps }] = await Promise.all([
          supabase.from('pyq_tests').select('*').eq('id', testId).single(),
          supabase.from('pyq_questions').select('*').eq('test_id', testId).order('order_index'),
          supabase.from('pyq_passages').select('id, passage_text').eq('test_id', testId),
        ])
        if (te) throw te
        if (qe) throw qe
        setTest(t)
        setQuestions(qs || [])
        setTimeLeft((t?.duration_minutes || 120) * 60)
        if (ps) {
          const map: Record<string, string> = {}
          ps.forEach((p: Passage) => { map[p.id] = p.passage_text })
          setPassageMap(map)
        }
      } catch (e: any) {
        setLoadError(e.message)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [testId])

  // ── Live clock ────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setLiveTime(
        now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) +
        '  ' +
        now.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })
      )
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // ── Main timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'active') return
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current!)
          handleSubmit(true)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(timerRef.current!)
  }, [phase])

  // ── Per-question time tracking ────────────────────────────────────────────
  const [qStartTime, setQStartTime] = useState<number>(Date.now())
  const [qTimes, setQTimes] = useState<Record<number, number>>({})
  const [currentQTime, setCurrentQTime] = useState('00:00')

  useEffect(() => {
    if (phase !== 'active') return
    const id = setInterval(() => {
      const elapsed = Math.floor((Date.now() - qStartTime) / 1000) + (qTimes[currentIndex] || 0)
      const m = Math.floor(elapsed / 60)
      const s = elapsed % 60
      setCurrentQTime(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`)
    }, 1000)
    return () => clearInterval(id)
  }, [phase, qStartTime, qTimes, currentIndex])

  const navigateToQuestion = (i: number) => {
    // save elapsed time for current question
    const elapsed = Math.floor((Date.now() - qStartTime) / 1000)
    setQTimes(prev => ({ ...prev, [currentIndex]: (prev[currentIndex] || 0) + elapsed }))
    setQStartTime(Date.now())
    setCurrentIndex(i)
  }

  // ── Answer helpers ─────────────────────────────────────────────────────────
  const currentAnswer = answers[currentIndex]
  const currentQuestion = questions[currentIndex]

  const selectAnswer = (opt: string) => {
    if (phase !== 'active') return
    setAnswers(prev => {
      const existing = prev[currentIndex]
      const wasMarked = existing?.status === 'marked' || existing?.status === 'answered-marked'
      return {
        ...prev,
        [currentIndex]: {
          selected: opt,
          status: wasMarked ? 'answered-marked' : 'answered',
        },
      }
    })
  }

  const clearAnswer = () => {
    if (phase !== 'active') return
    setAnswers(prev => {
      const existing = prev[currentIndex]
      const wasMarked = existing?.status === 'marked' || existing?.status === 'answered-marked'
      return {
        ...prev,
        [currentIndex]: {
          selected: '',
          status: wasMarked ? 'marked' : 'unattempted',
        },
      }
    })
  }

  const toggleMark = () => {
    if (phase !== 'active') return
    setAnswers(prev => {
      const existing = prev[currentIndex]
      const hasAnswer = existing?.selected
      const isMarked = existing?.status === 'marked' || existing?.status === 'answered-marked'
      return {
        ...prev,
        [currentIndex]: {
          selected: existing?.selected || '',
          status: isMarked
            ? (hasAnswer ? 'answered' : 'unattempted')
            : (hasAnswer ? 'answered-marked' : 'marked'),
        },
      }
    })
  }

  const isMarked = currentAnswer?.status === 'marked' || currentAnswer?.status === 'answered-marked'

  // "Save & Next" — marks not-answered if user clicked next without selecting
  const saveAndNext = () => {
    if (phase !== 'active') return
    if (!currentAnswer?.selected) {
      setAnswers(prev => ({
        ...prev,
        [currentIndex]: {
          selected: '',
          status: 'not-answered',
        },
      }))
    }
    if (currentIndex < questions.length - 1) {
      navigateToQuestion(currentIndex + 1)
    } else {
      setShowSubmitModal(true)
    }
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback((autoSubmit = false) => {
    if (!autoSubmit) setShowSubmitModal(false)
    clearInterval(timerRef.current!)
    setPhase('submitted')
  }, [])

  // ── Results calc ───────────────────────────────────────────────────────────
  const results = (() => {
    if (!test || questions.length === 0) return null
    let correct = 0, wrong = 0, skipped = 0
    questions.forEach((q, i) => {
      const ans = answers[i]?.selected
      if (!ans) { skipped++; return }
      if (ans === q.correct_answer) correct++
      else wrong++
    })
    const score = correct * 1 - wrong * test.negative_marking
    const pct = Math.round((correct / questions.length) * 100)
    return { correct, wrong, skipped, score, pct, total: questions.length }
  })()

  // ── Palette counts ─────────────────────────────────────────────────────────
  const answeredCount = Object.values(answers).filter(a => a.status === 'answered' || a.status === 'answered-marked').length
  const markedCount = Object.values(answers).filter(a => a.status === 'marked' || a.status === 'answered-marked').length
  const notAnsweredCount = Object.values(answers).filter(a => a.status === 'not-answered').length
  const notVisitedCount = questions.length - Object.keys(answers).length

  const isTimeLow = timeLeft <= 300

  // ─────────────────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (loadError || !test) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <AlertTriangle className="w-10 h-10 text-red-500" />
        <p className="text-destructive">{loadError || 'Test not found'}</p>
        <button onClick={() => router.back()} className="px-4 py-2 bg-muted rounded-lg text-sm font-medium hover:bg-muted/80">
          Go Back
        </button>
      </div>
    )
  }

  // ── INSTRUCTIONS SCREEN ───────────────────────────────────────────────────
  if (phase === 'instructions') {
    return (
      <div className="min-h-full overflow-y-auto bg-gray-50">
        {/* Admin banner */}
        <div className="bg-amber-500 text-white text-center py-2 text-sm font-bold flex items-center justify-center gap-2">
          <Eye className="w-4 h-4" />
          ADMIN PREVIEW MODE — This is how the exam appears to students
        </div>

        {/* Back button bar */}
        <div className="bg-white border-b border-gray-200 px-4 py-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Admin
          </button>
        </div>

        <div className="max-w-3xl mx-auto px-4 py-10">
          {/* Header card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm text-center mb-6">
            <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-4">
              {test.exam_name}{test.year ? ` ${test.year}` : ''}
            </div>
            <h1 className="text-2xl font-extrabold text-gray-900 mb-2">{test.title}</h1>
            <p className="text-gray-500 text-sm">Online Mock Test · Admin Preview</p>
          </div>

          {/* Info grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Duration', value: `${test.duration_minutes} min` },
              { label: 'Questions', value: questions.length },
              { label: 'Total Marks', value: test.total_marks },
              { label: 'Negative Marking', value: `−${test.negative_marking}` },
            ].map(item => (
              <div key={item.label} className="bg-white border border-gray-200 rounded-xl p-4 text-center shadow-sm">
                <div className="text-2xl font-extrabold text-gray-900">{item.value}</div>
                <div className="text-xs text-gray-500 mt-1">{item.label}</div>
              </div>
            ))}
          </div>

          {/* Instructions */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
            <h2 className="font-bold text-gray-800 mb-4 text-lg">General Instructions</h2>
            <ul className="space-y-2 text-sm text-gray-600">
              {[
                `This exam contains ${questions.length} multiple-choice questions.`,
                `Total duration: ${test.duration_minutes} minutes. Timer starts when you click "Start Exam".`,
                `Each correct answer carries 1 mark. Wrong answers carry a penalty of −${test.negative_marking}.`,
                'Unattempted questions carry no marks.',
                'Use "Mark for Review" to flag questions you want to revisit.',
                'The exam auto-submits when the timer reaches zero.',
                ...(test.instructions ? [test.instructions] : []),
              ].map((line, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </div>

          {/* Legend */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-8">
            <h2 className="font-bold text-gray-800 mb-4">Question Status Legend</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Not Visited', cls: 'bg-gray-100 text-gray-600 border-gray-300' },
                { label: 'Answered', cls: 'bg-green-100 text-green-700 border-green-300' },
                { label: 'Marked for Review', cls: 'bg-purple-100 text-purple-700 border-purple-300' },
                { label: 'Not Answered', cls: 'bg-red-100 text-red-600 border-red-300' },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2 text-sm">
                  <span className={cn('w-8 h-8 rounded border-2 flex items-center justify-center font-bold text-xs', item.cls)}>1</span>
                  <span className="text-gray-600 text-xs">{item.label}</span>
                </div>
              ))}
            </div>
          </div>

          {questions.length === 0 ? (
            <div className="w-full py-4 bg-gray-100 text-gray-500 rounded-2xl font-bold text-center border border-gray-200">
              No questions found. Add questions to this test first.
            </div>
          ) : (
            <button
              onClick={() => { setPhase('active'); setCurrentIndex(0); setQStartTime(Date.now()) }}
              className="w-full py-4 bg-blue-600 text-white rounded-2xl font-extrabold text-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
            >
              Start Exam →
            </button>
          )}
          <button
            onClick={() => router.back()}
            className="w-full mt-3 py-3 text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
          >
            ← Back to Admin
          </button>
        </div>
      </div>
    )
  }

  // ── RESULTS SCREEN ────────────────────────────────────────────────────────
  if (phase === 'submitted' && results) {
    const ri = reviewIndex
    return (
      <div className="min-h-full overflow-y-auto bg-gray-50">
        {/* Admin banner */}
        <div className="bg-amber-500 text-white text-center py-2 text-sm font-bold flex items-center justify-center gap-2">
          <Eye className="w-4 h-4" />
          ADMIN PREVIEW — Results Screen
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Score card */}
          <div className="bg-white border border-gray-200 rounded-2xl p-8 shadow-sm text-center mb-6">
            <div className="text-5xl mb-3">
              {results.pct >= 80 ? '🏆' : results.pct >= 60 ? '🌟' : results.pct >= 40 ? '💪' : '📚'}
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 mb-1">
              {results.score.toFixed(2)} / {test.total_marks}
            </h1>
            <p className="text-gray-500 mb-6">
              {results.pct >= 80 ? 'Excellent performance!' : results.pct >= 60 ? 'Good attempt!' : results.pct >= 40 ? 'Keep practicing!' : 'Needs more preparation'}
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Correct', value: results.correct, color: 'text-green-600', bg: 'bg-green-50' },
                { label: 'Wrong', value: results.wrong, color: 'text-red-600', bg: 'bg-red-50' },
                { label: 'Skipped', value: results.skipped, color: 'text-gray-500', bg: 'bg-gray-50' },
                { label: 'Accuracy', value: `${results.pct}%`, color: 'text-blue-600', bg: 'bg-blue-50' },
              ].map(s => (
                <div key={s.label} className={cn('rounded-xl p-4', s.bg)}>
                  <div className={cn('text-2xl font-extrabold', s.color)}>{s.value}</div>
                  <div className="text-xs text-gray-500 mt-1">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Question-by-question review */}
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-6">
            <h2 className="font-bold text-gray-800 mb-4 text-lg">Question Review</h2>
            <div className="flex flex-wrap gap-2 mb-6">
              {questions.map((q, i) => {
                const ans = answers[i]?.selected
                const isCorrect = ans === q.correct_answer
                const wasAttempted = !!ans
                return (
                  <button
                    key={i}
                    onClick={() => setReviewIndex(reviewIndex === i ? null : i)}
                    className={cn(
                      'w-9 h-9 rounded-lg text-xs font-bold transition-all border-2',
                      reviewIndex === i ? 'ring-2 ring-blue-600 ring-offset-2 scale-110' : '',
                      !wasAttempted
                        ? 'bg-gray-100 text-gray-500 border-gray-200'
                        : isCorrect
                          ? 'bg-green-500 text-white border-transparent'
                          : 'bg-red-500 text-white border-transparent'
                    )}
                  >
                    {i + 1}
                  </button>
                )
              })}
            </div>

            {ri !== null && questions[ri] && (() => {
              const q = questions[ri]
              const userAns = answers[ri]?.selected
              const isCorrect = userAns === q.correct_answer
              return (
                <div className="border border-gray-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Question {ri + 1}</span>
                    <span className={cn('flex items-center gap-1 text-sm font-bold', isCorrect ? 'text-green-600' : userAns ? 'text-red-600' : 'text-gray-500')}>
                      {isCorrect ? <CheckCircle2 className="w-4 h-4" /> : userAns ? <XCircle className="w-4 h-4" /> : null}
                      {isCorrect ? 'Correct' : userAns ? 'Wrong' : 'Skipped'}
                    </span>
                  </div>

                  {q.passage_id && passageMap[q.passage_id] && (
                    <div className="bg-blue-50 border-l-4 border-blue-500 rounded-lg p-4 text-sm text-blue-800 leading-relaxed">
                      {passageMap[q.passage_id]}
                    </div>
                  )}

                  <p className="font-semibold text-gray-800 leading-relaxed">{q.question_text}</p>

                  <div className="space-y-2">
                    {OPTION_LABELS.map(opt => {
                      const text = q[OPTION_FIELDS[opt]] as string
                      const isCorrectOpt = opt === q.correct_answer
                      const isUserOpt = opt === userAns
                      return (
                        <div
                          key={opt}
                          className={cn(
                            'flex items-start gap-3 p-3 rounded-lg text-sm border-2',
                            isCorrectOpt ? 'bg-green-50 border-green-300' :
                            isUserOpt && !isCorrectOpt ? 'bg-red-50 border-red-300' :
                            'bg-gray-50 border-transparent'
                          )}
                        >
                          <span className={cn(
                            'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                            isCorrectOpt ? 'bg-green-500 text-white' :
                            isUserOpt ? 'bg-red-500 text-white' :
                            'bg-gray-200 text-gray-600'
                          )}>
                            {opt}
                          </span>
                          <span className={cn(
                            isCorrectOpt ? 'text-green-800 font-medium' :
                            isUserOpt ? 'text-red-800 font-medium' :
                            'text-gray-700'
                          )}>
                            {text}
                            {isCorrectOpt && <span className="ml-2 text-xs font-bold text-green-600">(Correct Answer)</span>}
                            {isUserOpt && !isCorrectOpt && <span className="ml-2 text-xs font-bold text-red-600">(Your Answer)</span>}
                          </span>
                        </div>
                      )
                    })}
                  </div>

                  {q.explanation && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">Explanation</p>
                      <p className="text-sm text-amber-800 leading-relaxed">{q.explanation}</p>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                setPhase('instructions')
                setAnswers({})
                setCurrentIndex(0)
                setReviewIndex(null)
                setTimeLeft((test?.duration_minutes || 120) * 60)
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Retake Exam
            </button>
            <button
              onClick={() => router.back()}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Admin
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── ACTIVE EXAM ───────────────────────────────────────────────────────────
  return (
    <div className="min-h-full bg-gray-50 flex flex-col">

      {/* ── STICKY HEADER (AILET-style) ── */}
      <div className="bg-white shadow-sm border-b sticky top-0 z-40">
        <div className="px-4 py-3 flex items-center justify-between">
          {/* Left: live date/time + title */}
          <div className="flex items-center gap-4 min-w-0">
            <div className="text-xs text-gray-500 shrink-0 hidden sm:block">{liveTime}</div>
            <h1 className="text-base font-bold text-gray-900 truncate">{test.title}</h1>
          </div>
          {/* Right: admin badge + timer */}
          <div className="flex items-center gap-3 shrink-0 ml-3">
            <button
              onClick={() => setShowCorrectAnswers(!showCorrectAnswers)}
              className={cn(
                'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold transition-all border',
                showCorrectAnswers
                  ? 'bg-green-600 text-white border-green-600 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              )}
              title={showCorrectAnswers ? 'Hide correct answers' : 'Show correct answers'}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {showCorrectAnswers ? 'Answers Shown' : 'Show Answers'}
            </button>
            <div className="flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-bold">
              <Eye className="w-3 h-3" />
              Admin Preview
            </div>
            <div className={cn(
              'text-sm font-bold font-mono',
              isTimeLow ? 'text-red-600 animate-pulse' : 'text-red-500'
            )}>
              Time Left: {formatTime(timeLeft)}
            </div>
          </div>
        </div>
      </div>

      {/* Empty state */}
      {questions.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500">
          <AlertTriangle className="w-12 h-12 mb-4 text-amber-500" />
          <h2 className="text-xl font-bold mb-2 text-gray-800">No Questions Available</h2>
          <p className="max-w-md text-sm">This test has no questions yet. Add questions from the editor to preview the exam.</p>
        </div>
      ) : (
        <div className="flex-1 flex gap-0 overflow-hidden">

          {/* ── LEFT PANEL: Question ── */}
          <div className="flex-1 flex flex-col overflow-hidden">

            {/* Section nav bar */}
            <div className="bg-white border-b px-6 py-2">
              <span className="text-blue-600 font-semibold text-sm">Questions</span>
            </div>

            {/* Question detail bar */}
            <div className="bg-gray-50 border-b px-6 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="font-semibold text-gray-800">Question-{currentIndex + 1}</span>
                <span>Marking Scheme: +1 −{test.negative_marking}</span>
                <span className="font-mono text-xs">{currentQTime}</span>
              </div>
              <button
                onClick={toggleMark}
                className={cn(
                  'px-3 py-1 text-xs border rounded font-medium transition-colors',
                  isMarked
                    ? 'border-purple-500 bg-purple-50 text-purple-700'
                    : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                )}
              >
                <span className="flex items-center gap-1">
                  <Flag className="w-3 h-3" />
                  {isMarked ? 'Marked for Review' : 'Mark for Review'}
                </span>
              </button>
            </div>

            {/* Scrollable question body */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6">

                {/* Passage */}
                {currentQuestion?.passage_id && passageMap[currentQuestion.passage_id] && (
                  <div className="mb-6 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500">
                    <h3 className="font-bold text-blue-900 mb-2 text-sm">Passage</h3>
                    <p className="whitespace-pre-wrap text-sm text-blue-800 leading-relaxed">
                      {passageMap[currentQuestion.passage_id]}
                    </p>
                  </div>
                )}

                {/* Question text */}
                <div className="mb-6">
                  <p className="text-base leading-relaxed text-gray-900">
                    {currentQuestion?.question_text}
                  </p>
                </div>

                  {OPTION_LABELS.map(opt => {
                    const text = currentQuestion?.[OPTION_FIELDS[opt]] as string
                    const isSelected = currentAnswer?.selected === opt
                    const isCorrect = showCorrectAnswers && opt === currentQuestion?.correct_answer

                    return (
                      <label
                        key={opt}
                        className={cn(
                          'flex items-start gap-3 p-4 border-2 rounded-lg cursor-pointer transition-all relative',
                          isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : isCorrect
                              ? 'border-green-500 bg-green-50/50'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                        )}
                      >
                        <input
                          type="radio"
                          name={`question-${currentIndex}`}
                          value={opt}
                          checked={isSelected}
                          onChange={() => selectAnswer(opt)}
                          className="mt-1 accent-blue-600"
                        />
                        <span className="font-semibold text-gray-700 mr-1">{opt}.</span>
                        <div className="flex-1">
                          <span className={cn('text-sm leading-relaxed', isSelected ? 'text-blue-800' : 'text-gray-700')}>
                            {text}
                          </span>
                          {isCorrect && (
                            <div className="text-[10px] font-bold text-green-600 flex items-center gap-1 mt-1 uppercase tracking-wider">
                              <CheckCircle2 className="w-3 h-3" />
                              Correct Answer
                            </div>
                          )}
                        </div>
                      </label>
                    )
                  })}

                {/* Admin Explanation View */}
                {showCorrectAnswers && currentQuestion?.explanation && (
                  <div className="mt-6 p-5 bg-amber-50 border border-amber-200 rounded-xl">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-4 h-4 text-amber-700" />
                      <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Admin Verification: Explanation</span>
                    </div>
                    <p className="text-sm text-amber-900 leading-relaxed whitespace-pre-wrap">
                      {currentQuestion.explanation}
                    </p>
                  </div>
                )}

                {/* Bottom navigation */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                  <button
                    onClick={() => navigateToQuestion(currentIndex - 1)}
                    disabled={currentIndex === 0}
                    className="px-6 py-2.5 border border-gray-300 rounded-lg text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    ← Previous
                  </button>

                  <div className="flex items-center gap-2">
                    {currentAnswer?.selected && (
                      <button
                        onClick={clearAnswer}
                        className="px-3 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        Clear Response
                      </button>
                    )}
                  </div>

                  <button
                    onClick={saveAndNext}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold transition-colors"
                  >
                    {currentIndex === questions.length - 1 ? 'Submit Exam →' : 'Save & Next →'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div className="w-72 xl:w-80 bg-white border-l border-gray-200 hidden lg:flex flex-col overflow-hidden shrink-0">

            {/* User strip */}
            <div className="flex items-center gap-3 p-4 border-b border-gray-100">
              <div className="w-9 h-9 bg-blue-600 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0">
                A
              </div>
              <div>
                <p className="font-semibold text-sm text-gray-900">Admin</p>
                <p className="text-xs text-amber-600">Preview Mode</p>
              </div>
            </div>

            {/* Stats summary */}
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-sm text-gray-800">Questions: {questions.length}</span>
              </div>

              {/* Legend */}
              <div className="space-y-1.5 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-100 border border-gray-300 rounded" />
                  <span className="text-gray-600">{notVisitedCount} Not Visited</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-green-100 border border-green-300 rounded" />
                  <span className="text-gray-600">{answeredCount} Answered</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-100 border border-red-300 rounded" />
                  <span className="text-gray-600">{notAnsweredCount} Not Answered</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-purple-100 border border-purple-300 rounded" />
                  <span className="text-gray-600">{markedCount} Marked for Review</span>
                </div>
              </div>
            </div>

            {/* Question palette */}
            <div className="flex-1 overflow-y-auto p-4">
              <h3 className="font-semibold text-sm text-gray-800 mb-3">Questions</h3>
              <div className="grid grid-cols-5 gap-2">
                {questions.map((_, i) => {
                  const status = answers[i]?.status || 'unattempted'
                  return (
                    <button
                      key={i}
                      onClick={() => navigateToQuestion(i)}
                      className={cn(
                        'w-10 h-10 rounded text-xs font-semibold transition-all border-2',
                        paletteColor(status, i === currentIndex)
                      )}
                    >
                      {i + 1}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Submit button */}
            <div className="p-4 border-t border-gray-100">
              <button
                onClick={() => setShowSubmitModal(true)}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors"
              >
                Submit Test
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit Confirmation Modal ── */}
      {showSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-gray-200">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Submit Test?</h2>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 mb-5 space-y-2 text-sm border border-gray-100">
              <div className="flex justify-between">
                <span className="text-gray-500">Answered</span>
                <span className="font-bold text-green-600">{answeredCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Not Answered</span>
                <span className="font-bold text-red-500">{notAnsweredCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Marked for Review</span>
                <span className="font-bold text-purple-600">{markedCount}</span>
              </div>
              <div className="flex justify-between border-t border-gray-200 pt-2 mt-2">
                <span className="text-gray-500">Time Remaining</span>
                <span className={cn('font-bold font-mono', isTimeLow ? 'text-red-600' : 'text-gray-800')}>
                  {formatTime(timeLeft)}
                </span>
              </div>
            </div>

            <p className="text-sm text-gray-500 mb-5">
              Once submitted, you cannot change your answers. Are you sure?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-3 border border-gray-200 rounded-xl font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSubmit()}
                className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-colors"
              >
                Yes, Submit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
