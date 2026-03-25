export const PYQ_AI_SYSTEM_PROMPT = `You are extracting MCQ questions from a CLAT PG (Common Law Admission Test - Post Graduate) question paper.

Return ONLY one valid JSON object. No prose. No markdown unless your interface requires a standard json code block to expose an editor.

The JSON shape must be:
{
  "passages": [
    {
      "client_passage_id": "P1",
      "section": "I",
      "passage_text": "Full passage text",
      "passage_citation": "Source or citation line",
      "subject": "Constitutional Law"
    }
  ],
  "questions": [
    {
      "client_question_id": "Q1",
      "passage_id": "P1",
      "question_text": "Question text without numbering",
      "option_a": "Option A",
      "option_b": "Option B",
      "option_c": "Option C",
      "option_d": "Option D",
      "correct_answer": "A",
      "explanation": "",
      "question_type": "mcq",
      "subject": "Constitutional Law"
    }
  ]
}

Rules:
- Store each passage exactly once in the passages array.
- passage_id inside a question must reference passages.client_passage_id.
- Standalone questions must use "passage_id": null.
- correct_answer must be exactly one of "A", "B", "C", "D". Map 1/2/3/4 to A/B/C/D.
- Strip question numbers from question_text.
- Clean OCR noise and whitespace.
- Include the full passage text. Do not repeat the same passage inside multiple questions.
- If the answer key is separate at the end, match answers by question number.
- If answer is unknown, use "".
- question_type should be one of: "mcq", "statement", "consider_statements", "assertion_reason", "match_list".
- Return ALL questions you can find.`

export interface PyqPassageDraft {
  client_passage_id: string
  passage_text: string
  section: string
  passage_citation: string
  subject: string
  _expanded?: boolean
}

export interface PyqQuestionDraft {
  client_question_id: string
  passage_id: string | null
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: string
  explanation: string
  question_type: string
  subject: string
  _expanded?: boolean
}

export interface PyqDraftBundle {
  passages: PyqPassageDraft[]
  questions: PyqQuestionDraft[]
}

export interface DbPyqPassageRow {
  id: string
  order_index: number
  passage_text: string
  citation?: string | null
  section_number?: string | null
  subject?: string | null
}

export interface DbPyqQuestionRow {
  id: string
  order_index: number
  passage_id: string | null
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: string
  explanation?: string | null
  question_type?: string | null
  subject?: string | null
}

const QUESTION_TYPE_FALLBACK = 'mcq'

function makePassageId(index: number) {
  return `P${index + 1}`
}

function makeQuestionId(index: number) {
  return `Q${index + 1}`
}

export function getNextPassageId(passages: Array<{ client_passage_id: string }>): string {
  const maxId = passages.reduce((max, passage) => {
    const match = passage.client_passage_id.match(/^P(\d+)$/i)
    return match ? Math.max(max, parseInt(match[1], 10)) : max
  }, 0)
  return `P${maxId + 1}`
}

export function getNextQuestionId(questions: Array<{ client_question_id: string }>): string {
  const maxId = questions.reduce((max, question) => {
    const match = question.client_question_id.match(/^Q(\d+)$/i)
    return match ? Math.max(max, parseInt(match[1], 10)) : max
  }, 0)
  return `Q${maxId + 1}`
}

export function looksLikeJSON(text: string): boolean {
  const trimmed = text.trimStart().replace(/^```(?:json)?\s*/i, '')
  return trimmed.startsWith('{') || trimmed.startsWith('[')
}

function normalizeAnswer(value: unknown): string {
  const map: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' }
  const raw = String(value || '').trim().toUpperCase()
  const first = raw.charAt(0)
  return map[first] || first
}

function extractJSONObject(raw: string): string {
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim()
  const start = stripped.indexOf('{')
  const end = stripped.lastIndexOf('}')
  if (start === -1 || end === -1) {
    throw new Error('No JSON object found')
  }
  return stripped.slice(start, end + 1)
}

export function validateQuestionDraft(question: Partial<PyqQuestionDraft>): string | undefined {
  if (!question.passage_id?.trim()) return 'Link this question to a passage'
  if (!question.question_text?.trim()) return 'Question text is empty'
  if (!question.option_a?.trim() || !question.option_b?.trim() || !question.option_c?.trim() || !question.option_d?.trim()) {
    return 'Missing options'
  }
  if (!['A', 'B', 'C', 'D'].includes(question.correct_answer || '')) return 'No correct answer'
  return undefined
}

export function validatePassageDraft(passage: Partial<PyqPassageDraft>): string | undefined {
  if (!passage.passage_text?.trim()) return 'Passage text is empty'
  return undefined
}

export function parsePyqJson(raw: string): PyqDraftBundle {
  const jsonStr = extractJSONObject(raw)
  const parsed = JSON.parse(jsonStr)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('JSON must be one object with passages and questions')
  }

  const rawPassages = Array.isArray(parsed.passages) ? parsed.passages : null
  const rawQuestions = Array.isArray(parsed.questions) ? parsed.questions : null
  if (!rawPassages || !rawQuestions) {
    throw new Error('JSON must include both passages[] and questions[]')
  }

  const passages: PyqPassageDraft[] = rawPassages.map((item: any, index: number) => ({
    client_passage_id: String(item.client_passage_id || makePassageId(index)).trim(),
    section: String(item.section || '').trim(),
    passage_text: String(item.passage_text || item.text || '').trim(),
    passage_citation: String(item.passage_citation || item.citation || '').trim(),
    subject: String(item.subject || '').trim(),
    _expanded: false,
  }))

  const seenPassageIds = new Set<string>()
  for (const passage of passages) {
    if (!passage.client_passage_id) throw new Error('Passage is missing client_passage_id')
    if (seenPassageIds.has(passage.client_passage_id)) {
      throw new Error(`Duplicate client_passage_id "${passage.client_passage_id}"`)
    }
    const passageError = validatePassageDraft(passage)
    if (passageError) throw new Error(`Passage ${passage.client_passage_id}: ${passageError}`)
    seenPassageIds.add(passage.client_passage_id)
  }

  const questions: PyqQuestionDraft[] = rawQuestions
    .filter((item: any) => item && typeof item === 'object')
    .map((item: any, index: number) => ({
      client_question_id: String(item.client_question_id || makeQuestionId(index)).trim(),
      passage_id: item.passage_id === null || item.passage_id === '' || item.passage_id === undefined
        ? null
        : String(item.passage_id).trim(),
      question_text: String(item.question_text || item.question || '').trim(),
      option_a: String(item.option_a || item.a || '').trim(),
      option_b: String(item.option_b || item.b || '').trim(),
      option_c: String(item.option_c || item.c || '').trim(),
      option_d: String(item.option_d || item.d || '').trim(),
      correct_answer: normalizeAnswer(item.correct_answer || item.answer || item.ans || item.correct || item.key),
      explanation: String(item.explanation || '').trim(),
      question_type: String(item.question_type || QUESTION_TYPE_FALLBACK).trim() || QUESTION_TYPE_FALLBACK,
      subject: String(item.subject || '').trim(),
      _expanded: false,
    }))
    .filter((question) => question.question_text.length > 3)

  for (const question of questions) {
    const questionError = validateQuestionDraft(question)
    if (questionError) throw new Error(`${question.client_question_id}: ${questionError}`)
    if (question.passage_id && !seenPassageIds.has(question.passage_id)) {
      throw new Error(`${question.client_question_id}: unknown passage_id "${question.passage_id}"`)
    }
  }

  return { passages, questions }
}

export function parsePyqText(raw: string): PyqDraftBundle {
  const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = normalized
    .split(/(?=^\s*(?:Q\.?\s*)?\d+[\.\)]\s)/m)
    .map((block) => block.trim())
    .filter(Boolean)

  const questions: PyqQuestionDraft[] = blocks.flatMap((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean)
    if (lines.length < 3) return []

    const questionLines: string[] = []
    const options: Record<string, string> = {}
    let correctAnswer = ''
    const explanationLines: string[] = []
    let inExplanation = false
    let inOptions = false

    for (const line of lines) {
      const answerMatch = line.match(/^(?:ans(?:wer)?|correct(?:\s+answer)?)\s*[:\.]?\s*[\(\[]?\s*([A-Da-d1-4])\s*[\)\]]?/i)
      if (answerMatch) {
        correctAnswer = normalizeAnswer(answerMatch[1])
        inExplanation = false
        continue
      }

      if (/^(?:explanation|exp|solution|reason|rationale)\s*[:\.]?\s*/i.test(line)) {
        inExplanation = true
        const body = line.replace(/^(?:explanation|exp|solution|reason|rationale)\s*[:\.]?\s*/i, '').trim()
        if (body) explanationLines.push(body)
        continue
      }

      if (inExplanation) {
        explanationLines.push(line)
        continue
      }

      const optionMatch = line.match(/^[\(\[]?\s*([A-Da-d1-4])\s*[\)\]\.]?\s+(.+)/)
      if (optionMatch) {
        const key = normalizeAnswer(optionMatch[1])
        if (['A', 'B', 'C', 'D'].includes(key)) {
          options[key] = optionMatch[2].trim()
          inOptions = true
          continue
        }
      }

      if (!inOptions) questionLines.push(line)
    }

    const questionText = questionLines.join(' ').replace(/^\s*(?:Q\.?\s*)?\d+[\.\)]\s*/, '').trim()
    if (!questionText) return []

    return [{
      client_question_id: makeQuestionId(index),
      passage_id: null,
      question_text: questionText,
      option_a: options.A || '',
      option_b: options.B || '',
      option_c: options.C || '',
      option_d: options.D || '',
      correct_answer: correctAnswer,
      explanation: explanationLines.join(' ').trim(),
      question_type: QUESTION_TYPE_FALLBACK,
      subject: '',
      _expanded: false,
    }]
  })

  return { passages: [], questions }
}

export function parsePyqInput(raw: string): PyqDraftBundle {
  return ensureQuestionsLinkedToPassages(looksLikeJSON(raw) ? parsePyqJson(raw) : parsePyqText(raw))
}

export function getPassageSummary(bundle: PyqDraftBundle): { client_passage_id: string; count: number }[] {
  return bundle.passages.map((passage) => ({
    client_passage_id: passage.client_passage_id,
    count: bundle.questions.filter((question) => question.passage_id === passage.client_passage_id).length,
  }))
}

export function getPassageMap(passages: PyqPassageDraft[]): Record<string, PyqPassageDraft> {
  return Object.fromEntries(passages.map((passage) => [passage.client_passage_id, passage]))
}

export function buildPyqReviewText(bundle: PyqDraftBundle): string {
  const passageMap = getPassageMap(bundle.passages)
  const lines = bundle.questions.map((question, index) => {
    const passage = question.passage_id ? passageMap[question.passage_id] : null
    const header = [`Q${index + 1}. ${question.question_text}`]
    if (passage) {
      header.unshift(`PASSAGE ${passage.client_passage_id}: ${passage.passage_text}`)
    }
    return [
      ...header,
      `A. ${question.option_a}`,
      `B. ${question.option_b}`,
      `C. ${question.option_c}`,
      `D. ${question.option_d}`,
      `Answer: ${question.correct_answer || '?'}`,
      question.explanation ? `Explanation: ${question.explanation}` : '',
    ].filter(Boolean).join('\n')
  })
  return `PARSED QUESTIONS - ${bundle.questions.length} total\n${'='.repeat(48)}\n\n${lines.join('\n\n')}`
}

export function buildDraftFromDb(passages: DbPyqPassageRow[], questions: DbPyqQuestionRow[]): PyqDraftBundle {
  const orderedPassages = [...passages].sort((a, b) => a.order_index - b.order_index)
  const dbToClient = new Map<string, string>()
  const draftPassages = orderedPassages.map((passage, index) => {
    const clientId = makePassageId(index)
    dbToClient.set(passage.id, clientId)
    return {
      client_passage_id: clientId,
      section: String(passage.section_number || '').trim(),
      passage_text: passage.passage_text || '',
      passage_citation: String(passage.citation || '').trim(),
      subject: String(passage.subject || '').trim(),
      _expanded: false,
    }
  })

  const draftQuestions = [...questions]
    .sort((a, b) => a.order_index - b.order_index)
    .map((question, index) => ({
      client_question_id: question.id || makeQuestionId(index),
      passage_id: question.passage_id ? (dbToClient.get(question.passage_id) || null) : null,
      question_text: question.question_text || '',
      option_a: question.option_a || '',
      option_b: question.option_b || '',
      option_c: question.option_c || '',
      option_d: question.option_d || '',
      correct_answer: normalizeAnswer(question.correct_answer),
      explanation: String(question.explanation || '').trim(),
      question_type: String(question.question_type || QUESTION_TYPE_FALLBACK).trim() || QUESTION_TYPE_FALLBACK,
      subject: String(question.subject || '').trim(),
      _expanded: false,
    }))

  return ensureQuestionsLinkedToPassages({ passages: draftPassages, questions: draftQuestions })
}

export function ensureQuestionsLinkedToPassages(bundle: PyqDraftBundle): PyqDraftBundle {
  if (bundle.passages.length === 0) {
    return bundle
  }

  const passageIds = bundle.passages.map((passage) => passage.client_passage_id)
  const normalizedQuestions = bundle.questions.map((question, index) => {
    if (question.passage_id && passageIds.includes(question.passage_id)) {
      return question
    }

    const inferredPassageId = passageIds[Math.min(Math.floor(index / 5), passageIds.length - 1)] || passageIds[0]
    return {
      ...question,
      passage_id: inferredPassageId,
    }
  })

  return {
    passages: bundle.passages,
    questions: normalizedQuestions,
  }
}
