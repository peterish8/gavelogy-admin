'use client'

import { useState, useMemo } from 'react'
import { parseQuizText } from '@/lib/quiz-parser'
import { cn } from '@/lib/utils'
import { ArrowLeft, RotateCcw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface FullscreenQuizViewProps {
  content: string
  title: string
  onClose: () => void
}

// Full-screen quiz player overlay with gradient background; read-only (no inline editing), closes via onClose.
export function FullscreenQuizView({ content, title, onClose }: FullscreenQuizViewProps) {
  // Parse quiz text into structured data once per content change.
  const parsedQuiz = useMemo(() => parseQuizText(content), [content])
  
  const [currentIndex, setCurrentIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [showResult, setShowResult] = useState(false)

  const { passage, questions } = parsedQuiz
  const currentQuestion = questions[currentIndex]
  const totalQuestions = questions.length

  const isCorrect = selectedAnswer === currentQuestion?.correctAnswer

  // Records the chosen answer and shows correct/incorrect feedback.
  const handleSelectAnswer = (letter: string) => {
    if (showResult) return
    setSelectedAnswer(letter)
    setShowResult(true)
  }

  // Moves to the next question after viewing the result.
  const handleContinue = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(prev => prev + 1)
      setSelectedAnswer(null)
      setShowResult(false)
    }
  }

  // Resets the quiz back to question 1 with no prior selections.
  const handleRestart = () => {
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
  }

  if (questions.length === 0) {
    return (
      <div className="fixed inset-0 z-100 bg-linear-to-br from-blue-100 via-slate-50 to-purple-100 flex items-center justify-center">
        <button onClick={onClose} className="absolute top-6 left-6 p-2 hover:bg-card/50 rounded-full transition-colors">
          <ArrowLeft className="w-6 h-6 text-muted-foreground" />
        </button>
        <div className="text-center text-muted-foreground">
          <p className="text-4xl mb-4">📝</p>
          <p>No quiz questions found.</p>
        </div>
      </div>
    )
  }

  // Prefer the parsed quiz's embedded title; fall back to the item title passed via props.
  const displayTitle = parsedQuiz.title || title

  return (
    <div className="fixed inset-0 z-100 bg-linear-to-br from-blue-100 via-slate-50 to-purple-100 overflow-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 px-6 py-4 flex items-center justify-between">
        <button 
          onClick={onClose} 
          className="p-2 hover:bg-card/50 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-muted-foreground" />
        </button>
        
        <div className="flex-1 text-center px-4">
          <h1 className="text-lg md:text-xl font-bold text-foreground line-clamp-1">{displayTitle}</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Preview Mode</p>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-muted-foreground">
            Question {currentIndex + 1} of {totalQuestions}
          </span>
          <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
            <div 
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 pb-32">
        {/* Main Card */}
        <div className="bg-card rounded-2xl shadow-lg border border-border/50 overflow-hidden">
          {/* Passage Section */}
          {passage && (
            <div className="p-6 border-b border-border/50">
              <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-3">Case Passage:</h3>
              <p className="text-foreground/90 leading-relaxed">{passage}</p>
            </div>
          )}

          {/* Question Section */}
          <div className="p-6">
            <p className="text-lg font-semibold text-foreground leading-relaxed mb-8">
              {currentQuestion.questionText}
            </p>

            {/* 2x2 Options Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {currentQuestion.options.map((option) => {
                const isSelected = selectedAnswer === option.letter
                const isCorrectOption = option.letter === currentQuestion.correctAnswer
                
                let optionStyles = 'bg-card border-2 border-border hover:border-border text-foreground'
                
                if (showResult) {
                  if (isSelected && !isCorrectOption) {
                    // Selected wrong answer - red background
                    optionStyles = 'bg-red-500 border-2 border-red-500 text-white'
                  } else if (isCorrectOption) {
                    // Correct answer - green background
                    optionStyles = 'bg-emerald-500 border-2 border-emerald-500 text-white'
                  } else {
                    // Other unselected options
                    optionStyles = 'bg-card border-2 border-border text-muted-foreground/70 opacity-60'
                  }
                }

                return (
                  <button
                    key={option.letter}
                    onClick={() => handleSelectAnswer(option.letter)}
                    disabled={showResult}
                    className={cn(
                      'w-full p-4 rounded-xl text-left transition-all duration-200',
                      'flex items-start gap-3',
                      optionStyles
                    )}
                  >
                    <span className={cn(
                      'w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold shrink-0',
                      showResult && (isCorrectOption || (isSelected && !isCorrectOption))
                        ? 'bg-card/20 text-inherit'
                        : 'bg-muted/80 text-muted-foreground'
                    )}>
                      {option.letter}
                    </span>
                    <span className="flex-1 text-sm leading-relaxed">{option.text}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Result/Explanation Section */}
          {showResult && (
            <div className={cn(
              'mx-6 mb-6 p-5 rounded-xl border',
              isCorrect 
                ? 'bg-emerald-50 border-emerald-200' 
                : 'bg-red-50 border-red-200'
            )}>
              <div className="flex items-center gap-2 mb-2">
                {isCorrect ? (
                  <>
                    <span className="text-emerald-600 font-bold">✓ Correct!</span>
                  </>
                ) : (
                  <>
                    <XCircle className="w-5 h-5 text-red-600" />
                    <span className="text-red-600 font-bold">Incorrect</span>
                  </>
                )}
              </div>
              
              {!isCorrect && (
                <p className="text-foreground/90 mb-2">
                  <span className="font-semibold">Correct Answer:</span> ({currentQuestion.correctAnswer})
                </p>
              )}
              
              {currentQuestion.explanation && (
                <p className="text-muted-foreground text-sm leading-relaxed">
                  <span className="font-semibold text-foreground">Explanation:</span> {currentQuestion.explanation}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Fixed Footer with Continue/Restart */}
      {showResult && (
        <div className="fixed bottom-0 left-0 right-0 z-20 p-6 bg-linear-to-t from-slate-100 to-transparent">
          <div className="max-w-4xl mx-auto flex justify-center">
            {currentIndex < totalQuestions - 1 ? (
              <Button 
                onClick={handleContinue} 
                className="px-12 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-full text-base font-medium shadow-lg"
              >
                Continue
              </Button>
            ) : (
              <div className="text-center space-y-3">
                <p className="text-emerald-600 font-semibold">🎉 Quiz Complete!</p>
                <Button onClick={handleRestart} variant="outline" className="rounded-full">
                  <RotateCcw className="w-4 h-4 mr-2" />
                  Start Over
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
