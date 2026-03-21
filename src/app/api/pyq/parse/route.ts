import { NextRequest, NextResponse } from 'next/server'

// ─── System prompt ─────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert at extracting MCQ questions from Indian law exam PDFs (CLAT PG, AILET, Judiciary, UPSC Law).

You will receive raw text extracted from a PYQ (Previous Year Question) paper PDF.

YOUR TASK:
- Extract every multiple-choice question from the text
- Match each question with its correct answer (the answer key may be inline OR at the end of the document)
- Handle passage-based questions efficiently using passage_group tags
- Return ONLY a valid JSON array — no markdown, no explanation, no code blocks

PASSAGE HANDLING (critical for CLAT PG — 1 passage → 5-10 questions):
- Assign a passage_group tag ("P1", "P2", "P3"...) to group questions that share a reading passage
- Include the full passage_text ONLY on the FIRST question of each group
- For all subsequent questions in the same group: same passage_group, but passage_text: ""
- Standalone questions (no passage): passage_group: null, passage_text: ""

OUTPUT FORMAT (strict JSON array):
[
  {
    "passage_group": "P1",
    "passage_text": "Full passage text here — only on first question of the group",
    "question_text": "According to the passage, which of the following is correct?",
    "option_a": "First option text",
    "option_b": "Second option text",
    "option_c": "Third option text",
    "option_d": "Fourth option text",
    "correct_answer": "B",
    "explanation": ""
  },
  {
    "passage_group": "P1",
    "passage_text": "",
    "question_text": "Another question about the same passage",
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
- correct_answer must be EXACTLY one of: "A", "B", "C", "D"
- If options use numbers (1/2/3/4), map them: 1→A, 2→B, 3→C, 4→D
- If options use lowercase (a/b/c/d), uppercase them to A/B/C/D
- If the answer key is separate at the end, match answers to questions by question number
- Strip question numbers from question_text (remove "1." "Q1." "Q.1" etc.)
- Clean up OCR artifacts, broken line breaks, extra whitespace
- If you cannot determine the correct answer, use "" for correct_answer
- Return ONLY the JSON array — start with "[" and end with "]"
- Extract ALL questions you can find`

// ─── AI helpers (same pattern as existing routes) ─────────────────────────

async function callNvidia(messages: any[], apiKey: string): Promise<string> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'moonshotai/kimi-k2.5', messages, max_tokens: 16384, temperature: 0.1 }),
  })
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

async function callGroq(messages: any[], apiKey: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile', // 70b for better extraction accuracy
      messages,
      max_tokens: 8000,
      temperature: 0.1, // very low — deterministic extraction
    }),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

async function callOpenRouter(messages: any[], apiKey: string, model: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://gavelogy.com',
      'X-Title': 'Gavelogy PYQ Parser',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 12000,
      temperature: 0.1,
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter(${model}) ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

// ─── JSON cleaner ─────────────────────────────────────────────────────────

function extractJSON(raw: string): string {
  // Strip markdown code blocks if present
  const stripped = raw.replace(/```(?:json)?\s*/gi, '').replace(/```\s*$/g, '').trim()
  // Find array boundaries
  const start = stripped.indexOf('[')
  const end = stripped.lastIndexOf(']')
  if (start === -1 || end === -1) throw new Error('No JSON array found in response')
  return stripped.slice(start, end + 1)
}

interface ParsedQuestion {
  question_text: string
  option_a: string
  option_b: string
  option_c: string
  option_d: string
  correct_answer: string
  explanation: string
  passage_group: string | null
  passage_text: string
}

function validateAndClean(questions: any[]): ParsedQuestion[] {
  return questions
    .filter((q: any) => q && typeof q === 'object')
    .map((q: any) => {
      const map: Record<string, string> = { '1': 'A', '2': 'B', '3': 'C', '4': 'D' }
      const ca = String(q.correct_answer || '').toUpperCase().trim().charAt(0)
      return {
        question_text: String(q.question_text || '').trim(),
        option_a: String(q.option_a || '').trim(),
        option_b: String(q.option_b || '').trim(),
        option_c: String(q.option_c || '').trim(),
        option_d: String(q.option_d || '').trim(),
        correct_answer: map[ca] || ca,
        explanation: String(q.explanation || '').trim(),
        passage_group: q.passage_group ? String(q.passage_group).trim() : null,
        passage_text: String(q.passage_text || q.passage || '').trim(),
      }
    })
    .filter(q => q.question_text.length > 5)
}

// ─── Route handler ────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { pdfText, fileName } = await req.json()

    if (!pdfText?.trim()) {
      return NextResponse.json({ error: 'No PDF text provided' }, { status: 400 })
    }

    // Truncate to ~14,000 chars to stay within token limits safely
    // For very long papers, the user can still manually paste remaining questions
    const textToProcess = pdfText.length > 14000
      ? pdfText.slice(0, 14000) + '\n\n[... text truncated due to length ...]'
      : pdfText

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Extract all MCQ questions from this ${fileName ? `"${fileName}" ` : ''}PDF text. Return ONLY a JSON array:\n\n${textToProcess}`,
      },
    ]

    const errors: string[] = []
    const nvidiaKey = process.env.NVIDIA_API_KEY
    const groqKey = process.env.GROQ_API_KEY
    const orKey = process.env.OPENROUTER_API_KEY

    let rawResponse: string | null = null

    // 1. NVIDIA Kimi K2.5 — highest priority (16k tokens, excellent extraction)
    if (nvidiaKey) {
      try {
        rawResponse = await callNvidia(messages, nvidiaKey)
        console.log('[pyq/parse] NVIDIA success')
      } catch (e: any) {
        errors.push(`NVIDIA: ${e.message}`)
        console.warn('[pyq/parse] NVIDIA failed:', e.message)
      }
    }

    // 2. Groq (llama-3.3-70b for accuracy)
    if (!rawResponse && groqKey) {
      try {
        rawResponse = await callGroq(messages, groqKey)
        console.log('[pyq/parse] Groq success')
      } catch (e: any) {
        errors.push(`Groq: ${e.message}`)
        console.warn('[pyq/parse] Groq failed:', e.message)
      }
    }

    // Fallback: OpenRouter with large-context models
    if (!rawResponse && orKey) {
      const models = [
        'google/gemini-2.0-flash-001',         // Best for long documents
        'google/gemini-2.0-flash-exp:free',     // Free tier
        'meta-llama/llama-3.3-70b-instruct',   // Strong extraction
        'mistralai/mistral-large',              // Good JSON
      ]
      for (const model of models) {
        try {
          rawResponse = await callOpenRouter(messages, orKey, model)
          console.log(`[pyq/parse] OpenRouter/${model} success`)
          break
        } catch (e: any) {
          errors.push(`${model}: ${e.message}`)
          console.warn(`[pyq/parse] ${model} failed:`, e.message)
        }
      }
    }

    if (!rawResponse) {
      return NextResponse.json(
        { error: `All AI providers failed — ${errors.join(' | ')}` },
        { status: 500 }
      )
    }

    // Parse and validate JSON
    let questions: ParsedQuestion[]
    try {
      const jsonStr = extractJSON(rawResponse)
      const parsed = JSON.parse(jsonStr)
      if (!Array.isArray(parsed)) throw new Error('Response is not an array')
      questions = validateAndClean(parsed)
    } catch (e: any) {
      console.error('[pyq/parse] JSON parse failed:', e.message)
      console.error('[pyq/parse] Raw response:', rawResponse.slice(0, 500))
      return NextResponse.json(
        { error: `AI returned invalid JSON: ${e.message}`, raw: rawResponse.slice(0, 2000) },
        { status: 422 }
      )
    }

    if (questions.length === 0) {
      return NextResponse.json(
        { error: 'AI could not find any questions in this PDF. Try the manual paste method instead.' },
        { status: 422 }
      )
    }

    return NextResponse.json({
      questions,
      count: questions.length,
      truncated: pdfText.length > 14000,
    })
  } catch (err: any) {
    console.error('[pyq/parse] Unexpected error:', err)
    return NextResponse.json({ error: err.message || 'Parse failed' }, { status: 500 })
  }
}
