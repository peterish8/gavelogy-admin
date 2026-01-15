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

export function QuizPreview({ content, onContentChange }: QuizPreviewProps) {
  // We keep a local copy of parsed data to handle potential "invalid intermediate states" while editing text
  // However, for inline editing, we likely want to edit the structured data directly.
  
  const parsedQuiz = useMemo(() => parseQuizText(content), [content])
  
  // Local state for the quiz data being edited (if in edit mode)
  // We initialize it with parsedQuiz whenever content changes externally
  const [localQuiz, setLocalQuiz] = useState<ParsedQuiz>(parsedQuiz)
  
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

  const handleSelectAnswer = (letter: string) => {
    if (showResult || editingQuestionId !== null) return
    setSelectedAnswer(letter)
    setShowResult(true)
  }

  const handleContinue = () => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex(prev => prev + 1)
      setSelectedAnswer(null)
      setShowResult(false)
    }
  }

  const handleRestart = () => {
    setCurrentIndex(0)
    setSelectedAnswer(null)
    setShowResult(false)
  }

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

  const handleSaveEdit = () => {
      // Serialize localQuiz back to text
      const newText = serializeQuiz(localQuiz)
      
      // Notify parent
      if (onContentChange) {
          onContentChange(newText)
      }
      
      setEditingQuestionId(null)
  }

  // Helper to update current question in local state
  const updateCurrentQuestion = (updates: Partial<QuizQuestion>) => {
      setLocalQuiz(prev => ({
          ...prev,
          questions: prev.questions.map(q => 
              q.id === currentQuestion.id ? { ...q, ...updates } : q
          )
      }))
  }

    // Helper to update option
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
      <div className="flex flex-col items-center justify-center h-full p-8 text-center text-slate-400">
        <div className="text-4xl mb-4 opacity-50">📝</div>
        <p>No quiz questions found.</p>
      </div>
    )
  }

  const isEditing = editingQuestionId === currentQuestion.id

  return (
    <div className="flex flex-col h-full bg-linear-to-br from-slate-50 to-slate-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-white/80 backdrop-blur-sm border-b flex items-center justify-between shrink-0">
        <div>
          <h2 className="font-bold text-lg text-slate-800">Quiz Preview</h2>
          <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Question {currentIndex + 1} of {totalQuestions}</p>
        </div>
        <div className="flex items-center gap-3">
           {/* Edit Button (Admin Only) */}
           {onContentChange && (
               isEditing ? (
                   <div className="flex items-center gap-2">
                       <Button size="sm" variant="ghost" onClick={handleEditToggle} className="text-slate-500">
                           <X className="w-4 h-4 mr-2" /> Cancel
                       </Button>
                       <Button size="sm" onClick={handleSaveEdit} className="bg-green-600 hover:bg-green-700 text-white">
                           <Save className="w-4 h-4 mr-2" /> Done
                       </Button>
                   </div>
               ) : (
                   <Button size="sm" variant="outline" onClick={handleEditToggle} className="h-8 border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200">
                       <Edit2 className="w-3.5 h-3.5 mr-2" /> Edit Question
                   </Button>
               )
           )}

           {!isEditing && (
                <>
                    {/* Progress Bar */}
                    <div className="hidden sm:block w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${((currentIndex + 1) / totalQuestions) * 100}%` }}
                        />
                    </div>
                    <Button variant="ghost" size="icon" onClick={handleRestart} title="Restart Quiz" className="h-8 w-8 text-slate-400 hover:text-slate-600">
                        <RotateCcw className="w-4 h-4" />
                    </Button>
                </>
           )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6 pb-20">
          
          {/* Persistent Title (if exists) */}
          {(localQuiz.title) && (
             <div className="text-center mb-6">
                 <h1 className="text-2xl font-bold text-slate-800">{localQuiz.title}</h1>
             </div>
          )}

          {/* Passage (if exists) */}
          {passage && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-slate-100">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Passage</h3>
              <p className="text-slate-600 leading-relaxed text-sm">{passage}</p>
            </div>
          )}

          {/* Question Card */}
          <div className={cn("bg-white rounded-xl p-6 shadow-sm border border-slate-100", isEditing && "ring-2 ring-blue-500/20 border-blue-500")}>
            {isEditing ? (
                <div className="space-y-4">
                     {/* Title Edit (Only visible if title exists or creating one) */}
                     <div className="space-y-2">
                         <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Quiz Title (Optional)</label>
                         <Input 
                            value={localQuiz.title || ''}
                            onChange={(e) => setLocalQuiz(prev => ({ ...prev, title: e.target.value }))}
                            placeholder="e.g. Constitutional Law Quiz"
                            className="font-bold text-lg"
                         />
                     </div>
                                         
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-blue-600 uppercase tracking-wider">Question Text</label>
                        <Textarea 
                            value={currentQuestion.questionText}
                            onChange={(e) => updateCurrentQuestion({ questionText: e.target.value })}
                            className="text-lg font-medium text-slate-800 min-h-[80px] resize-none border-0 bg-slate-50 focus:bg-white focus:ring-0 p-0"
                        />
                    </div>
                </div>
            ) : (
                <p className="text-lg font-medium text-slate-800 leading-relaxed">
                {currentQuestion.questionText}
                </p>
            )}
          </div>

          {/* Options Grid */}
          <div className="grid grid-cols-1 gap-3">
            {currentQuestion.options.map((option) => {
              const isSelected = selectedAnswer === option.letter
              const isCorrectOption = option.letter === currentQuestion.correctAnswer
              
              let optionStyles = 'bg-white border-slate-200 hover:border-blue-300 hover:bg-blue-50/50'
              
              if (!isEditing && showResult) {
                if (isCorrectOption) {
                  optionStyles = 'bg-emerald-50 border-emerald-500/50 text-emerald-900 shadow-sm'
                } else if (isSelected && !isCorrectOption) {
                  optionStyles = 'bg-rose-50 border-rose-500/50 text-rose-900'
                } else {
                  optionStyles = 'bg-slate-50 border-transparent text-slate-400 opacity-50 cursor-not-allowed'
                }
              }

              return (
                <div key={option.letter} className="group relative">
                    <button
                        onClick={() => handleSelectAnswer(option.letter)}
                        disabled={showResult || isEditing}
                        className={cn(
                            'w-full p-4 rounded-xl border text-left transition-all duration-200',
                            'flex items-start gap-4',
                            isEditing ? 'bg-white border-slate-200' : optionStyles
                        )}
                    >
                        <span className={cn(
                            'w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 border transition-colors',
                            isEditing ? (option.letter === currentQuestion.correctAnswer ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-100 text-slate-500 border-slate-200') :
                            showResult && isCorrectOption ? 'bg-emerald-500 border-emerald-500 text-white' : 
                            showResult && isSelected && !isCorrectOption ? 'bg-rose-500 border-rose-500 text-white' :
                            'bg-slate-50 border-slate-200 text-slate-500 group-hover:bg-white'
                        )}>
                            {option.letter}
                        </span>
                        
                        <div className="flex-1">
                            {isEditing ? (
                                <Input 
                                    value={option.text}
                                    onChange={(e) => updateOption(option.letter, e.target.value)}
                                    className="h-7 border-0 p-0 text-base focus-visible:ring-0 shadow-none bg-transparent"
                                />
                            ) : (
                                <span className="text-base">{option.text}</span>
                            )}
                        </div>

                         {/* Mark Correct Button in Edit Mode */}
                         {isEditing && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation()
                                    updateCurrentQuestion({ correctAnswer: option.letter })
                                }}
                                className={cn(
                                    "text-xs px-2 py-1 rounded font-medium transition-colors border",
                                    option.letter === currentQuestion.correctAnswer 
                                        ? "bg-green-100 text-green-700 border-green-200" 
                                        : "bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100"
                                )}
                            >
                                {option.letter === currentQuestion.correctAnswer ? "Correct Answer" : "Mark Correct"}
                            </button>
                         )}
                    </button>
                </div>
              )
            })}
          </div>

          {/* Explanation / Result */}
          {(showResult || isEditing) && (
            <div className={cn(
              'rounded-xl p-6 border animate-in slide-in-from-bottom-2 duration-300',
              isEditing ? 'bg-slate-50 border-slate-200 border-dashed' :
              isCorrect 
                ? 'bg-emerald-50/50 border-emerald-100' 
                : 'bg-rose-50/50 border-rose-100'
            )}>
               {isEditing ? (
                   <div className="space-y-2">
                       <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Explanation</label>
                        <Textarea 
                            value={currentQuestion.explanation}
                            onChange={(e) => updateCurrentQuestion({ explanation: e.target.value })}
                            className="min-h-[60px] resize-none bg-white font-normal" 
                            placeholder="Add an explanation..."
                        />
                   </div>
               ) : (
                   <>
                        <div className="flex items-center gap-2 mb-3">
                            {isCorrect ? (
                            <>
                                <CheckCircle className="w-5 h-5 text-emerald-600" />
                                <span className="font-bold text-emerald-800">Correct!</span>
                            </>
                            ) : (
                            <>
                                <XCircle className="w-5 h-5 text-rose-600" />
                                <span className="font-bold text-rose-800">Incorrect</span>
                            </>
                            )}
                        </div>
                        
                        {!isCorrect && (
                            <p className="text-slate-700 mb-2">
                            The correct answer is <span className="font-bold">{currentQuestion.correctAnswer}</span>.
                            </p>
                        )}
                        
                        {currentQuestion.explanation && (
                            <div className="text-slate-600 text-sm leading-relaxed border-t border-slate-200/50 pt-3 mt-3">
                                <span className="font-semibold text-slate-900 mr-1">Explanation:</span>
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
        <div className="px-6 py-4 bg-white/80 backdrop-blur-sm border-t flex justify-center shrink-0">
          {currentIndex < totalQuestions - 1 ? (
            <Button onClick={handleContinue} className="px-8 bg-slate-900 hover:bg-slate-800 text-white rounded-full">
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          ) : (
            <div className="text-center w-full">
              <p className="text-emerald-600 font-semibold mb-3">🎉 Quiz Complete!</p>
              <Button onClick={handleRestart} variant="outline" className="w-full sm:w-auto">
                <RotateCcw className="w-4 h-4 mr-2" />
                Start Over
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
