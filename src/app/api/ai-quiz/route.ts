import { NextRequest, NextResponse } from 'next/server'
import { isAdminApiRequest, unauthorizedResponse, checkPayloadSize } from '@/lib/admin-auth'

const SYSTEM_PROMPT = `You are Gavelogy's Quiz Engine. Your job is to read a completed Gavelogy case law note and generate exactly 10 MCQ questions from it, strictly following the CLAT PG question pattern.

You will be given the full text of one case law note. You must derive every question exclusively from the content of that note — the facts, provisions, holdings, case laws referenced, statutes, doctrinal lineage, doctrines, and mnemonic. Do not bring in outside knowledge to create questions that cannot be answered from the note.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — follow this EXACT plain-text format, nothing else
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Title_display: <Case Name — Year>

Q1. <Question text>
A. <Option A>
B. <Option B>
C. <Option C>
D. <Option D>
correct_ans: <A, B, C, or D>
Explanation: <max 50 words — which holding/field (e.g. H1, F4A, F6) makes this correct and why the other options are wrong>

...repeat for Q2 through Q10.

Do NOT wrap in code blocks or markdown. Start directly with "Title_display:".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE 10-QUESTION DISTRIBUTION — MANDATORY, NO SUBSTITUTIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q1  — Case Recall               [EASY]
Q2  — Provision Identification  [EASY]
Q3  — Statement Evaluation      [MEDIUM]
Q4  — Statement Evaluation      [MEDIUM]
Q5  — Doctrine Identification   [MEDIUM]
Q6  — Lineage / Timeline        [MEDIUM]
Q7  — Ratio vs Obiter           [MEDIUM]
Q8  — Application (new facts)   [HARD]
Q9  — Application (new facts)   [HARD]
Q10 — Multi-concept Integration [HARD]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUESTION TYPE SPECIFICATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TYPE 1 — CASE RECALL [EASY] (Q1)
  Format: "Which case held that [principle from the note]?"
  Correct answer: the case being studied.
  Distractors: 3 real cases from the same subject area and doctrine cluster. Plausible but clearly wrong if the student read the note.
  Source: Draw from the Holdings (F5) or Doctrinal Lineage (F6).

TYPE 2 — PROVISION IDENTIFICATION [EASY] (Q2)
  Format: "Which provision was interpreted by the court to mean [X]?"
  or "Under which article/section did the court hold [X]?"
  Source: Draw from Key Provisions (F4).
  Distractors: 3 real provisions from the same constitutional or statutory family that were NOT the answer.

TYPE 3 & 4 — STATEMENT EVALUATION [MEDIUM] (Q3, Q4)
  Format:
    Statement I: [A statement about the case — tests the core ratio or a key fact]
    Statement II: [A second statement — tests an obiter or a lineage fact or a common misconception]
  Options:
    A. Both Statement I and Statement II are correct
    B. Only Statement I is correct
    C. Only Statement II is correct
    D. Neither Statement I nor Statement II is correct
  Rule: At least one of Q3/Q4 must have answer B (only Statement I correct). Statement II should test a common misconception or confuse ratio with obiter.
  Source: F5 (Holdings) and F6 (Lineage) primarily.

TYPE 5 — DOCTRINE IDENTIFICATION [MEDIUM] (Q5)
  Format: "Which of the following doctrines was invoked as [Primary/Secondary] in [case name]?"
  or "The principle that [description] is known as which doctrine?"
  Source: F6A (Doctrines & Principles in Play).
  Distractors: 3 real doctrine names from the same subject area.

TYPE 6 — LINEAGE / TIMELINE [MEDIUM] (Q6)
  Format: "Arrange the following cases in chronological order of their contribution to the [doctrine name]:"
  or "Which case in the [doctrine name] lineage immediately preceded [current case]?"
  or "Which of the following cases was overruled / distinguished / relied upon in [current case]?"
  Source: F6 Lineage Chain and F4A Case Laws Referenced.

TYPE 7 — RATIO VS OBITER [MEDIUM] (Q7)
  Format: Present 4 statements from the judgment. Student must identify which is the ratio decidendi.
  or: "Which of the following is the ratio decidendi (and not obiter dicta) in [case]?"
  Use actual H and O text from the note. This tests whether the student understood the ratio/obiter distinction.
  Source: F5 Holdings.

TYPE 8 & 9 — APPLICATION NEW FACTS [HARD] (Q8, Q9)
  Format:
    Facts: [A NEW hypothetical fact pattern — 40–60 words — genuinely different from the actual case but involving the same legal issue and the same provision(s)]
    Question: Based on the ratio of [case name], the court in this scenario should:
  Options: 4 outcomes — one correct (consistent with the ratio), three plausible but wrong.
  CRITICAL RULE: The hypothetical facts MUST be meaningfully different from the actual case. Different parties, different context, different setting — but same legal issue. If the hypothetical is too similar to the actual facts, the question fails its purpose.
  Source: F5 Holdings (H1/H2). Apply the ratio to the new facts.

TYPE 10 — MULTI-CONCEPT INTEGRATION [HARD] (Q10)
  Format: A question that requires the student to connect AT LEAST TWO of these fields simultaneously:
    - A provision from F4
    - A case from F4A
    - A doctrine from F6A
    - A holding from F5
  Example: "Which provision, as interpreted in [case X], forms the basis of the [doctrine name], and was this holding ratio or obiter?"
  Source: Any two or more of F4, F4A, F5, F6, F6A.
  This is the hardest question. It rewards students who understood the note as a connected whole, not just individual facts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY RULES — NEVER VIOLATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Every distractor must be a REAL case name, real provision number, or real doctrine name — never invented. A distractor that is obviously fake insults the student's intelligence.
2. No question can be answered by a student who has NOT read the note. Every correct answer must trace back to a specific field in the note (cite H1, H2, F4A, F6, etc. in the Explanation).
3. No two questions can test the same sentence or the same fact. Distribute coverage across all note fields.
4. The answer must never be "obvious" from the question text itself. All 4 options must be plausible to a student who studied the subject but didn't read this specific note carefully.
5. For Q8/Q9: never use facts near-identical to the actual case. The student must APPLY the ratio to a new situation, not recall it from the facts.
6. Output all 10 questions in one response. Do not ask for confirmation between questions.`

// Strip <think>…</think> blocks that some reasoning models (Apriel, Kimi) emit before their actual answer
function stripThinking(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

// Calls Cerebras and returns the cleaned plain-text quiz output.
async function callCerebras(messages: any[], apiKey: string, model: string, maxTokens = 4000): Promise<string> {
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_completion_tokens: maxTokens, temperature: 0.3 }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`Cerebras(${model}) ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return stripThinking(data.choices[0].message.content as string)
}

// Calls Together AI's Apriel model as a quiz-generation fallback.
async function callTogether(messages: any[], apiKey: string, maxTokens = 4000): Promise<string> {
  // Free model: ServiceNow Apriel 15B — suitable for quiz generation from notes
  const res = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'ServiceNow-AI/Apriel-1.6-15b-Thinker', messages, max_tokens: maxTokens, temperature: 0.3 }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`Together ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return stripThinking(data.choices[0].message.content as string)
}

// Calls NVIDIA's Kimi model, the preferred provider for quiz generation.
async function callNvidia(messages: any[], apiKey: string, maxTokens = 4000): Promise<string> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'moonshotai/kimi-k2.5', messages, max_tokens: maxTokens, temperature: 0.3 }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return stripThinking(data.choices[0].message.content as string)
}

// Calls Groq as a faster low-context fallback for MCQ generation.
async function callGroq(messages: any[], apiKey: string, maxTokens = 2000): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages, max_tokens: maxTokens, temperature: 0.3 }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return stripThinking(data.choices[0].message.content as string)
}

// Calls a specific OpenRouter model and returns the cleaned quiz text.
async function callOpenRouter(messages: any[], apiKey: string, model: string, maxTokens = 3000): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://gavelogy.com',
      'X-Title': 'Gavelogy Quiz AI',
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.3 }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`OpenRouter(${model}) ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return stripThinking(data.choices[0].message.content as string)
}

// POST handler: generates a 10-question quiz from note text, falling back across multiple AI providers.
export async function POST(req: NextRequest) {
  if (!(await isAdminApiRequest(req))) return unauthorizedResponse()
  const sizeError = checkPayloadSize(req, 500_000)  // 500KB max
  if (sizeError) return sizeError

  try {
    const { notesText } = await req.json()
    if (!notesText?.trim()) return NextResponse.json({ error: 'No notes text provided' }, { status: 400 })

    // Builds the shared provider payload from the fixed system prompt plus the trimmed note text.
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Generate exactly 10 MCQ questions from these case notes:\n\n${notesText.slice(0, 8000)}` },
    ]

    const errors: string[] = []
    const nvidiaKey = process.env.NVIDIA_API_KEY
    const cerebrasKey = process.env.CEREBRAS_API_KEY
    const togetherKey = process.env.TOGETHER_API_KEY
    const groqKey = process.env.GROQ_API_KEY
    const orKey = process.env.OPENROUTER_API_KEY

    // 1. NVIDIA Kimi K2.5 — highest priority
    // Tries configured providers in order and returns the first successful quiz response.
    if (nvidiaKey) {
      try {
        const quiz = await callNvidia(messages, nvidiaKey, 4000)
        return NextResponse.json({ quiz, provider: 'nvidia/kimi-k2.5' })
      } catch (e: any) {
        errors.push(`NVIDIA: ${e.message}`)
        console.warn('[ai-quiz] NVIDIA failed:', e.message)
      }
    }

    // 2. Cerebras — gpt-oss-120b → llama3.1-8b fallback
    if (cerebrasKey) {
      for (const model of ['gpt-oss-120b', 'llama3.1-8b']) {
        try {
          const quiz = await callCerebras(messages, cerebrasKey, model, 4000)
          return NextResponse.json({ quiz, provider: `cerebras/${model}` })
        } catch (e: any) {
          errors.push(`Cerebras(${model}): ${e.message}`)
          console.warn(`[ai-quiz] Cerebras(${model}) failed:`, e.message)
        }
      }
    }

    // 3. Together AI — free 15B model, good for quiz from notes
    if (togetherKey) {
      try {
        const quiz = await callTogether(messages, togetherKey, 4000)
        return NextResponse.json({ quiz, provider: 'together/apriel-15b' })
      } catch (e: any) {
        errors.push(`Together: ${e.message}`)
        console.warn('[ai-quiz] Together failed:', e.message)
      }
    }

    if (groqKey) {
      try {
        const quiz = await callGroq(messages, groqKey, 2000)
        return NextResponse.json({ quiz, provider: 'groq' })
      } catch (e: any) {
        errors.push(`Groq: ${e.message}`)
        console.warn('[ai-quiz] Groq failed:', e.message)
      }
    }

    if (!orKey) return NextResponse.json({ error: `No API keys configured. ${errors.join(' | ')}` }, { status: 500 })

    for (const model of ['google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3.1-8b-instruct:free', 'mistralai/mistral-7b-instruct:free']) {
      try {
        const quiz = await callOpenRouter(messages, orKey, model, 3000)
        return NextResponse.json({ quiz, provider: `openrouter/${model}` })
      } catch (e: any) {
        errors.push(`${model}: ${e.message}`)
        console.warn(`[ai-quiz] ${model} failed:`, e.message)
      }
    }

    for (const model of ['google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct']) {
      try {
        const quiz = await callOpenRouter(messages, orKey, model, 3000)
        return NextResponse.json({ quiz, provider: `openrouter/${model}` })
      } catch (e: any) {
        errors.push(`${model}: ${e.message}`)
        console.warn(`[ai-quiz] ${model} failed:`, e.message)
      }
    }

    return NextResponse.json({ error: `All providers failed — ${errors.join(' | ')}` }, { status: 500 })

  } catch (err: any) {
    console.error('[ai-quiz] Unexpected error:', err)
    return NextResponse.json({ error: 'AI quiz generation failed. Please try again.' }, { status: 500 })
  }
}
