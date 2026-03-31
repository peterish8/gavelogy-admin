'use client'

import { useState, useMemo, useEffect } from 'react'
import { parseQuizText, serializeQuiz, QuizQuestion, ParsedQuiz } from '@/lib/quiz-parser'
import { cn } from '@/lib/utils'
import { ChevronRight, CheckCircle, XCircle, RotateCcw, Edit2, Save, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

interface QuizPreviewProps {
  content: string
  onContentChange?: (newContent: string) => void
}

// Inline quiz player with per-question answer selection, result display, and optional inline editing of questions/options.
export function QuizPreview({ content, onContentChange }: QuizPreviewProps) {
  // We keep a local copy of parsed data to handle potential "invalid intermediate states" while editing text
  // However, for inline editing, we likely want to edit the structured data directly.

  // Parse quiz text into structured data; re-parse whenever content prop changes.
  const parsedQuiz = useMemo(() => parseQuizText(content), [content])
  
  // Local state for the quiz data being edited (if in edit mode)
  // We initialize it with parsedQuiz whenever content changes externally
  const [localQuiz, setLocalQuiz] = useState<ParsedQuiz>(parsedQuiz)
  
  // Sync local quiz state whenever the parent-supplied content string changes.
  useEffect(() => {
      setLocalQuiz(parseQuizText(content))
  }, [content])

  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null)

  const { passage, questions } = localQuiz
  const currentQuestion = questions[currentIndex]
  const totalQuestions = questions.length

  const isCorrect = selectedAnswer === currentQuestion?.correctAnswer

  // --- Handlers ---

  // Locks in the selected answer and reveals the correct/incorrect result panel.
  const handleSelectAnswer = (letter: string) => {
    if (showResult || editingQuestionId !== null) return
    setSelectedAnswer(letter)
    setShowResult(true)
  }

  // Advances to the next question, resetting selection state.
  const handleContinue = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(prev => prev + 1)
      setSelectedAnswer(null)
      setShowResult(false)
    }
  }

  // Resets quiz to the first question with no selections.
  const handleRestart = () => {
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
  }

  // Enters or cancels edit mode for the current question; cancels by resetting local state to prop content.
  const handleEditToggle = () => {
      if (editingQuestionId === null) {
          // Enter edit mode for current question
          setEditingQuestionId(currentQuestion.id)
      } else {
          // Cancel edit mode (revert changes)
          setEditingQuestionId(null)
          setLocalQuiz(parseQuizText(content)) // Reset to prop content
      }
  }

  // Serializes the edited local quiz back to text and calls onContentChange to persist it in the parent.
  const handleSaveEdit = () => {
      // Serialize localQuiz back to text
      const newText = serializeQuiz(localQuiz)
      
      // Notify parent
      if (onContentChange) {
          onContentChange(newText)
      }
      
      setEditingQuestionId(null)
  }

  // Merges partial field updates into the current question inside localQuiz.
  const updateCurrentQuestion = (updates: Partial<QuizQuestion>) => {
      setLocalQuiz(prev => ({
          ...prev,
          questions: prev.questions.map(q => 
              q.id === currentQuestion.id ? { ...q, ...updates } : q
          )
      }))
  }

  // Updates the text of a single answer option by its letter within localQuiz.
  const updateOption = (letter: string, text: string) => {
       setLocalQuiz(prev => ({
          ...prev,
          questions: prev.questions.map(q => 
              q.id === currentQuestion.id ? { 
                  ...q, 
                  options: q.options.map(opt => opt.letter === letter ? { ...opt, text } : opt)
              } : q
          )
      }))
  }


  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <span className="text-2xl">📝</span>
        </div>
        <p className="text-sm font-semibold text-foreground">No quiz questions found.</p>
        <p className="text-xs text-muted-foreground mt-1">Generate AI notes first — quiz is built from them.</p>
      </div>
    )
  }

  const isEditing = editingQuestionId === currentQuestion.id

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3 bg-background border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            {localQuiz.title && (
              <span className="text-xs font-bold text-primary uppercase tracking-widest truncate max-w-[200px]">{localQuiz.title}</span>
            )}
            <span className="text-[11px] text-muted-foreground font-medium">
              Question <span className="font-bold text-foreground">{currentIndex + 1}</span> / {totalQuestions}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
           {onContentChange && (
               isEditing ? (
                   <div className="flex items-center gap-2">
                       <Button size="sm" variant="ghost" onClick={handleEditToggle} className="text-muted-foreground h-7 text-xs">
                           <X className="w-3.5 h-3.5 mr-1" /> Cancel
                       </Button>
                       <Button size="sm" onClick={handleSaveEdit} className="bg-primary hover:bg-primary/90 text-primary-foreground h-7 text-xs">
                           <Save className="w-3.5 h-3.5 mr-1" /> Save
                       </Button>
                   </div>
               ) : (
                   <Button size="sm" variant="outline" onClick={handleEditToggle} className="h-7 text-xs border-border text-muted-foreground hover:text-foreground">
                       <Edit2 className="w-3 h-3 mr-1" /> Edit
                   </Button>
               )
           )}
           {!isEditing && (
               <Button variant="ghost" size="icon" onClick={handleRestart} title="Restart Quiz" className="h-7 w-7 text-muted-foreground/70 hover:text-foreground">
                   <RotateCcw className="w-3.5 h-3.5" />
               </Button>
           )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-border shrink-0">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
        />
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-5">
        <div className="max-w-2xl mx-auto space-y-5 pb-20">

          {/* Passage (if exists) */}
          {passage && (
            <div className="bg-primary/5 rounded-xl p-4 border border-primary/20">
              <h3 className="text-[10px] font-bold text-primary uppercase tracking-widest mb-2">Passage</h3>
              <p className="text-muted-foreground leading-relaxed text-sm">{passage}</p>
            </div>
          )}

          {/* Question Card */}
          <div className={cn(
            "bg-card rounded-2xl p-5 shadow-sm border border-border overflow-hidden relative",
            isEditing && "ring-2 ring-primary/20 border-primary"
          )}>
            {/* Coloured top accent */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-linear-to-r from-primary via-primary/70 to-primary/30" />
            <div className="pt-1">
              {isEditing ? (
                  <div className="space-y-4 mt-2">
                       <div className="space-y-1.5">
                           <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">Quiz Title (Optional)</label>
                           <Input
                              value={localQuiz.title || ''}
                              onChange={(e) => setLocalQuiz(prev => ({ ...prev, title: e.target.value }))}
                              placeholder="e.g. Constitutional Law Quiz"
                              className="font-bold"
                           />
                       </div>
                      <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-primary uppercase tracking-wider">Question Text</label>
                          <Textarea
                              value={currentQuestion.questionText}
                              onChange={(e) => updateCurrentQuestion({ questionText: e.target.value })}
                              className="text-base font-medium text-foreground min-h-[80px] resize-none"
                          />
                      </div>
                  </div>
              ) : (
                  <p className="text-base font-semibold text-foreground leading-relaxed mt-2">
                    {currentQuestion.questionText}
                  </p>
              )}
            </div>
          </div>

          {/* Options — 2×2 grid */}
          <div className="grid grid-cols-2 gap-3">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedAnswer === option.letter
              const isCorrectOption = option.letter === currentQuestion.correctAnswer
              let optionStyles = 'bg-card border-border hover:border-primary/50 hover:bg-primary/5 text-foreground'
              if (!isEditing && showResult) {
                if (isCorrectOption) {
                  optionStyles = 'bg-emerald-50 border-emerald-400 text-emerald-900 shadow-sm dark:bg-emerald-950/30 dark:border-emerald-600 dark:text-emerald-200'
                } else if (isSelected && !isCorrectOption) {
                  optionStyles = 'bg-rose-50 border-rose-400 text-rose-900 dark:bg-rose-950/30 dark:border-rose-600 dark:text-rose-200'
                } else {
                  optionStyles = 'bg-muted/50 border-border text-muted-foreground/50 opacity-50 cursor-not-allowed'
                }
              }

              return (
                <div key={option.letter} className="group relative">
                    <button
                        onClick={() => handleSelectAnswer(option.letter)}
                        disabled={showResult || isEditing}
                        className={cn(
                            'w-full h-full min-h-[72px] p-3.5 rounded-xl border text-left transition-all duration-200',
                            'flex flex-col gap-2',
                            isEditing ? 'bg-card border-border' : optionStyles
                        )}
                    >
                        <div className="flex items-center justify-between gap-2">
                          <span className={cn(
                              'w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 border transition-colors',
                              isEditing ? (option.letter === currentQuestion.correctAnswer ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted text-muted-foreground border-border') :
                              showResult && isCorrectOption ? 'bg-emerald-500 border-emerald-500 text-white' :
                              showResult && isSelected && !isCorrectOption ? 'bg-rose-500 border-rose-500 text-white' :
                              'bg-muted border-border text-muted-foreground group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary'
                          )}>
                              {option.letter}
                          </span>
                          {isEditing && (
                              <button
                                  onClick={(e) => {
                                      e.stopPropagation()
                                      updateCurrentQuestion({ correctAnswer: option.letter })
                                  }}
                                  className={cn(
                                      "text-[10px] px-1.5 py-0.5 rounded font-medium transition-colors border",
                                      option.letter === currentQuestion.correctAnswer
                                          ? "bg-primary/10 text-primary border-primary/30"
                                          : "bg-muted text-muted-foreground/60 border-border hover:bg-muted/80"
                                  )}
                              >
                                  {option.letter === currentQuestion.correctAnswer ? "✓ Correct" : "Mark"}
                              </button>
                          )}
                        </div>
                        <div className="flex-1">
                            {isEditing ? (
                                <Input
                                    value={option.text}
                                    onChange={(e) => updateOption(option.letter, e.target.value)}
                                    className="h-6 border-0 p-0 text-sm focus-visible:ring-0 shadow-none bg-transparent"
                                />
                            ) : (
                                <span className="text-sm leading-snug">{option.text}</span>
                            )}
                        </div>
                    </button>
                </div>
              )
            })}
          </div>

          {/* Explanation / Result */}
          {(showResult || isEditing) && (
            <div className={cn(
              'rounded-xl p-4 border animate-in slide-in-from-bottom-2 duration-300',
              isEditing ? 'bg-muted border-border border-dashed' :
              isCorrect
                ? 'bg-emerald-50/60 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
                : 'bg-rose-50/60 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800'
            )}>
               {isEditing ? (
                   <div className="space-y-1.5">
                       <label className="text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider">Explanation</label>
                        <Textarea
                            value={currentQuestion.explanation}
                            onChange={(e) => updateCurrentQuestion({ explanation: e.target.value })}
                            className="min-h-[60px] resize-none bg-card font-normal text-sm"
                            placeholder="Add an explanation..."
                        />
                   </div>
               ) : (
                   <>
                        <div className="flex items-center gap-2 mb-2">
                            {isCorrect ? (
                            <>
                                <CheckCircle className="w-4 h-4 text-emerald-600" />
                                <span className="font-bold text-sm text-emerald-800 dark:text-emerald-300">Correct!</span>
                            </>
                            ) : (
                            <>
                                <XCircle className="w-4 h-4 text-rose-600" />
                                <span className="font-bold text-sm text-rose-800 dark:text-rose-300">Incorrect</span>
                            </>
                            )}
                        </div>
                        {!isCorrect && (
                            <p className="text-sm text-foreground/90 mb-2">
                              Correct answer: <span className="font-bold">{currentQuestion.correctAnswer}</span>.
                            </p>
                        )}
                        {currentQuestion.explanation && (
                            <div className="text-muted-foreground text-xs leading-relaxed border-t border-border/50 pt-2.5 mt-2.5">
                                <span className="font-semibold text-foreground mr-1">Explanation:</span>
                                {currentQuestion.explanation}
                            </div>
                        )}
                   </>
               )}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      {(showResult && !isEditing) && (
        <div className="px-5 py-3.5 bg-background border-t border-border flex justify-center shrink-0">
          {currentIndex < totalQuestions - 1 ? (
            <Button onClick={handleContinue} className="px-8 bg-primary hover:bg-primary/90 text-primary-foreground rounded-full text-sm">
              Continue
              <ChevronRight className="w-4 h-4 ml-1.5" />
            </Button>
          ) : (
            <div className="text-center w-full">
              <p className="text-primary font-semibold text-sm mb-3">Quiz Complete!</p>
              <Button onClick={handleRestart} variant="outline" className="w-full sm:w-auto text-sm">
                <RotateCcw className="w-3.5 h-3.5 mr-2" />
                Start Over
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
