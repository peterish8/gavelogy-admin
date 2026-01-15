/**
 * quiz-parser.ts
 * 
 * Parses plain-text quiz format into structured data for the QuizPreview component.
 * 
 * Supported Format:
 * Q1. Question text here
 * A. Option A text
 * B. Option B text
 * C. Option C text
 * D. Option D text
 * Answer: B
 * Explanation: Explanation text here
 */

export interface QuizOption {
  letter: string
  text: string
}

export interface QuizQuestion {
  id: number
  questionText: string
  options: QuizOption[]
  correctAnswer: string
  explanation: string
}

export interface ParsedQuiz {
  title?: string
  passage?: string
  questions: QuizQuestion[]
}

/**
 * Parses plain text into structured quiz data
 */
export function parseQuizText(text: string): ParsedQuiz {
  if (!text || typeof text !== 'string') {
    return { questions: [] }
  }

  const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
  const questions: QuizQuestion[] = []
  let currentQuestion: Partial<QuizQuestion> | null = null
  let passage = ''
  let title = ''
  let questionId = 0

  // Check for passage and title at the start (before first Q)
  const firstQuestionIndex = lines.findIndex(line => /^Q\d*[.:]?\s/i.test(line))
  
  if (firstQuestionIndex > 0) {
     const preQuestionLines = lines.slice(0, firstQuestionIndex)
     
     // 1. Extract Title
     const titleLineIndex = preQuestionLines.findIndex(line => /^Title_display\s*:\s*/i.test(line))
     if (titleLineIndex !== -1) {
         title = preQuestionLines[titleLineIndex].replace(/^Title_display\s*:\s*/i, '').trim()
         // Remove title line from array so it doesn't become part of passage
         preQuestionLines.splice(titleLineIndex, 1)
     }

     // 2. Remaining is Passage
    // Remove "Passage:" prefix if present
    passage = preQuestionLines.join(' ').replace(/^(Case\s*)?Passage\s*:\s*/i, '').trim()
  }

  const questionLines = firstQuestionIndex >= 0 ? lines.slice(firstQuestionIndex) : lines

  for (const line of questionLines) {
    // 1. Check for Question (Start of new question)
    // Match question: Q1. or Q. or Q1: or just Q followed by text
    const questionMatch = line.match(/^Q(\d*)[.:]?\s*(.*)/i)
    if (questionMatch) {
      if (currentQuestion && currentQuestion.questionText) {
        questions.push(finalizeQuestion(currentQuestion, questionId))
        questionId++
      }
      currentQuestion = {
        questionText: questionMatch[2].trim(),
        options: [],
        correctAnswer: '',
        explanation: ''
      }
      continue
    }

    // 2. Check for Answer (Priority over Option to prevent "correct_ans" matching as Option C)
    const answerMatch = line.match(/^(?:correct_ans|Correct|Answer|Correct\s*Answer)\s*:\s*([A-D])/i)
    if (answerMatch && currentQuestion) {
      currentQuestion.correctAnswer = answerMatch[1].toUpperCase()
      continue
    }

    // 3. Check for Explanation
    const explanationMatch = line.match(/^Explanation\s*:\s*(.+)/i)
    if (explanationMatch && currentQuestion) {
      currentQuestion.explanation = explanationMatch[1].trim()
      continue
    }

    // 4. Check for Option
    // STRICTER REGEX: Require a separator like . ) or : to prevent "Correct" matching as "C"
    const optionMatch = line.match(/^(?:Option\s*)?([A-D])(?:\.|:|\))\s+(.+)/i)
    if (optionMatch && currentQuestion) {
      // Logic to prevent duplicate parsing
      if (currentQuestion.correctAnswer || currentQuestion.explanation) {
          // If we already have answer/explanation, assume this isn't an option 
          // (unless specifically "Option A" format, but let's be safe).
      } else {
          const letter = optionMatch[1].toUpperCase()
          const text = optionMatch[2].trim()
          
          currentQuestion.options = currentQuestion.options || []
          const existingIndex = currentQuestion.options.findIndex(o => o.letter === letter)
          if (existingIndex >= 0) {
              currentQuestion.options[existingIndex].text = text
          } else {
              currentQuestion.options.push({ letter, text })
          }
          continue
      }
    }

    // 5. Continuation Text
    if (currentQuestion) {
      if (currentQuestion.explanation) {
        currentQuestion.explanation += ' ' + line
      } else if (currentQuestion.correctAnswer && !currentQuestion.explanation) {
         // Assume text after answer is explanation
         currentQuestion.explanation = line
      } else if (currentQuestion.options && currentQuestion.options.length === 0) {
        if (currentQuestion.questionText) {
            currentQuestion.questionText += ' ' + line
        } else {
            currentQuestion.questionText = line
        }
      }
    }
  }

  // Don't forget the last question
  if (currentQuestion && currentQuestion.questionText) {
    questions.push(finalizeQuestion(currentQuestion, questionId))
  }

  return {
    title: title || undefined,
    passage: passage || undefined,
    questions
  }
}

function finalizeQuestion(q: Partial<QuizQuestion>, id: number): QuizQuestion {
  return {
    id,
    questionText: q.questionText || '',
    options: q.options || [],
    correctAnswer: q.correctAnswer || '',
    explanation: q.explanation || ''
  }
}

/**
 * Converts structured quiz data back to plain text format
 */
export function serializeQuiz(parsedQuiz: ParsedQuiz): string {
    let output = ''

    if (parsedQuiz.title) {
        output += `Title_display: ${parsedQuiz.title}\n\n`
    }

    if (parsedQuiz.passage) {
        output += `Passage: ${parsedQuiz.passage}\n\n`
    }

    parsedQuiz.questions.forEach((q, index) => {
        output += `Q${index + 1}. ${q.questionText}\n`
        q.options.forEach(opt => {
            output += `${opt.letter}. ${opt.text}\n`
        })
        if (q.correctAnswer) {
            output += `correct_ans: ${q.correctAnswer}\n`
        }
        if (q.explanation) {
            output += `Explanation: ${q.explanation}\n`
        }
        output += '\n'
    })

    return output.trim()
}
