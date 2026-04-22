import { NextRequest, NextResponse } from 'next/server'
import { isAdminApiRequest, unauthorizedResponse, checkPayloadSize } from '@/lib/admin-auth'

const SYSTEM_PROMPT = `You are Gavelogy's Flashcard Engine. Your job is to read a completed Gavelogy case law note and generate exactly 6 to 8 flashcards from it, following the spaced repetition principles built into Gavelogy's SRS system.

You will be given the full text of one case law note. Every flashcard must be derivable from the note content. Do not bring in facts from outside the note.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FLASHCARD PHILOSOPHY — READ THIS BEFORE WRITING ANY CARD
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

A flashcard tests ONE thing on the front and reveals ONE thing on the back. The front is a cue — a question, a case name, a doctrine name, a provision number. The back is the answer — a single holding, a single principle, a single definition. If the back of a card requires the student to remember more than two connected ideas, split it into two cards.

The cards are designed for spaced repetition. Students will see them again at 1 day, 7 days, 14 days, 21 days. Each card must be worth reviewing on its own — it cannot depend on the student remembering a different card to make sense of it.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE 6–8 CARD DISTRIBUTION — MANDATORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Cards 1–4 are always required. Cards 5–8: produce as many as the note's content supports, up to 4.

  Card 1 — CORE RATIO     [always required]
  Card 2 — CASE IDENTITY   [always required]
  Card 3 — KEY PROVISION   [always required]
  Card 4 — DOCTRINE NAME   [always required]
  Card 5 — OBITER DICTA    [include if obiter exists in the note]
  Card 6 — LINEAGE LINK    [include if lineage chain has 2+ cases]
  Card 7 — DANGER ZONE     [include if note contains an exam warning or Rose-highlighted danger]
  Card 8 — MNEMONIC        [include if note contains a mnemonic]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — repeat this exact block for each card, separated by ---
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

FRONT: [question or cue — concise, under 15 words]
BACK: [answer — self-contained, max 60 words, no bullet points]

---

Separate every card with --- on its own line. No markdown, no HTML, no extra text outside the FRONT/BACK/--- blocks.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CARD TYPE SPECIFICATIONS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CARD 1 — CORE RATIO
  FRONT: "What did the Court hold in [case name]?"
  BACK: The H1 [CORE RATIO] text from the note. Max 2 sentences. If H1 is over 40 words, condense to its essential legal proposition without losing accuracy.
  Source: F5, H1 [CORE RATIO]

CARD 2 — CASE IDENTITY
  FRONT: "[Full case name] ([Year])"
  BACK: Three lines only — Court: [court name] | Citation: [citation] | Core issue: [what question the case answered, one line]
  Source: F1 Identity Strip and case title

CARD 3 — KEY PROVISION
  FRONT: "What does [Article/Section number and name] mean as interpreted in [case name]?"
  BACK: The one-line court interpretation from Field 4 Provision 1. Emphasise the operative word or phrase that makes this interpretation significant.
  Source: F4 Provision 1 (the most important provision)

CARD 4 — DOCTRINE NAME
  FRONT: "What is the [Doctrine Name from F6]?"
  BACK: Two lines — Definition: [one sentence — what the doctrine says] | First established in: [Case name (Year)]
  Source: F6 Doctrine Name + F6A Primary doctrine entry

CARD 5 — OBITER DICTA (if applicable)
  FRONT: "In [case name], what did the Court observe (obiter) about [topic of O1]?"
  BACK: The O1 obiter text from the note, max 25 words. End with: (This is obiter dicta — non-binding)
  Source: F5, O1

CARD 6 — LINEAGE LINK (if applicable)
  FRONT: "Which case did [current case] overrule / follow / extend?"
  or: "Complete the [doctrine name] lineage chain: [Case A] → [Case B] → ___?"
  BACK: The answer from the Lineage Chain in F6. If overruled: name the case and state the principle that was replaced. If followed: name the case and state the principle that was inherited.
  Source: F6 Lineage Chain and F4A Overruled/Applied entries

CARD 7 — DANGER ZONE (if applicable)
  FRONT: "⚠️ Exam Trap: [Short description of the common mistake students make with this case]"
  BACK: The correct understanding — what the case actually held vs. what students often confuse it with. Max 2 sentences.
  Source: The Rose-highlighted warning/danger zone from the note, or any field where a common misconception arises.

CARD 8 — MNEMONIC (if applicable)
  FRONT: "Mnemonic for [case name]:"
  BACK: [The mnemonic text from the note] — [One line explaining what the mnemonic encodes]
  Source: F7 Mnemonic

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUALITY RULES FOR ALL CARDS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. FRONT must be a genuine retrieval cue — a question or incomplete statement — never a statement that reveals the answer.
2. BACK must be self-contained. The student must be able to judge whether their recall was correct from the back text alone.
3. BACK must never exceed 60 words. Accuracy over completeness — preserve the legal proposition, cut the elaboration.
4. No two cards can test the same piece of information. If Card 1 already covers the core ratio, Card 3 (Provision) must test the provision interpretation specifically, not the ratio again.
5. Legal accuracy is non-negotiable. If you are uncertain about any fact on a card, write [VERIFY] on the back rather than guessing.
6. Produce all 6–8 cards in order (Card 1 through Card 8). Output only the FRONT:/BACK:/--- blocks — nothing else.`

// Removes reasoning-model <think> blocks so only the user-facing answer is parsed into flashcards.
function stripThinking(raw: string): string {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
}

interface Flashcard {
  front: string
  back: string
}

// Parses the model's FRONT/BACK/--- plain-text output into structured flashcard objects.
function parseFlashcards(raw: string): Flashcard[] {
  const blocks = raw.split(/---+/).map(b => b.trim()).filter(Boolean)
  const cards: Flashcard[] = []
  for (const block of blocks) {
    const frontMatch = block.match(/FRONT:\s*(.+?)(?:\n|$)/i)
    const backMatch = block.match(/BACK:\s*([\s\S]+?)$/i)
    if (frontMatch && backMatch) {
      cards.push({
        front: frontMatch[1].trim(),
        back: backMatch[1].trim(),
      })
    }
  }
  return cards.slice(0, 8)
}

// Calls Cerebras chat completions and returns the cleaned raw flashcard text.
async function callCerebras(messages: any[], apiKey: string, model: string): Promise<string> {
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_completion_tokens: 2000, temperature: 0.3 }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`Cerebras(${model}) ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return stripThinking(data.choices[0].message.content as string)
}

// Calls Together AI's Apriel model for a lower-cost flashcard-generation fallback.
async function callTogether(messages: any[], apiKey: string): Promise<string> {
  // Free model: ServiceNow Apriel 15B — suitable for flashcard generation from notes
  const res = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'ServiceNow-AI/Apriel-1.6-15b-Thinker', messages, max_tokens: 2000, temperature: 0.3 }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`Together ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return stripThinking(data.choices[0].message.content as string)
}

// Calls NVIDIA's Kimi model, the preferred high-priority provider for flashcard generation.
async function callNvidia(messages: any[], apiKey: string): Promise<string> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'moonshotai/kimi-k2.5', messages, max_tokens: 2000, temperature: 0.3 }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return stripThinking(data.choices[0].message.content as string)
}

// Calls Groq as a fast fallback provider for simple flashcard generation.
async function callGroq(messages: any[], apiKey: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages, max_tokens: 1500, temperature: 0.3 }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return stripThinking(data.choices[0].message.content as string)
}

// Calls an OpenRouter model and returns cleaned flashcard text for the shared parser.
async function callOpenRouter(messages: any[], apiKey: string, model: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json',
      'HTTP-Referer': 'https://gavelogy.com', 'X-Title': 'Gavelogy Flashcards AI',
    },
    body: JSON.stringify({ model, messages, max_tokens: 1500, temperature: 0.3 }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`OpenRouter(${model}) ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return stripThinking(data.choices[0].message.content as string)
}

// POST handler: generates 6-8 flashcards from note text by trying configured AI providers in priority order.
export async function POST(req: NextRequest) {
  if (!(await isAdminApiRequest(req))) return unauthorizedResponse()
  const sizeError = checkPayloadSize(req, 500_000)  // 500KB max
  if (sizeError) return sizeError

  try {
    const { notesText } = await req.json()
    if (!notesText?.trim()) return NextResponse.json({ error: 'No notes text provided' }, { status: 400 })

    // Builds the fixed system prompt plus the trimmed note content sent to each provider.
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Generate 6-8 flashcards from these case notes:\n\n${notesText.slice(0, 8000)}` },
    ]

    const nvidiaKey = process.env.NVIDIA_API_KEY
    const cerebrasKey = process.env.CEREBRAS_API_KEY
    const togetherKey = process.env.TOGETHER_API_KEY
    const groqKey = process.env.GROQ_API_KEY
    const orKey = process.env.OPENROUTER_API_KEY

    // 1. NVIDIA Kimi K2.5 — highest priority
    // Tries providers in descending preference until one returns parseable flashcards.
    if (nvidiaKey) {
      try {
        const raw = await callNvidia(messages, nvidiaKey)
        const flashcards = parseFlashcards(raw)
        if (flashcards.length > 0) return NextResponse.json({ flashcards, provider: 'nvidia/kimi-k2.5' })
      } catch (e: any) { console.warn('[ai-flashcards] NVIDIA failed:', e.message) }
    }

    // 2. Cerebras — gpt-oss-120b → llama3.1-8b fallback
    if (cerebrasKey) {
      for (const model of ['gpt-oss-120b', 'llama3.1-8b']) {
        try {
          const raw = await callCerebras(messages, cerebrasKey, model)
          const flashcards = parseFlashcards(raw)
          if (flashcards.length > 0) return NextResponse.json({ flashcards, provider: `cerebras/${model}` })
        } catch (e: any) { console.warn(`[ai-flashcards] Cerebras(${model}) failed:`, e.message) }
      }
    }

    // 3. Together AI — free 15B model, good for flashcards from notes
    if (togetherKey) {
      try {
        const raw = await callTogether(messages, togetherKey)
        const flashcards = parseFlashcards(raw)
        if (flashcards.length > 0) return NextResponse.json({ flashcards, provider: 'together/apriel-15b' })
      } catch (e: any) { console.warn('[ai-flashcards] Together failed:', e.message) }
    }

    if (groqKey) {
      try {
        const raw = await callGroq(messages, groqKey)
        const flashcards = parseFlashcards(raw)
        if (flashcards.length > 0) return NextResponse.json({ flashcards, provider: 'groq' })
      } catch (e: any) { console.warn('[ai-flashcards] Groq failed:', e.message) }
    }

    if (orKey) {
      for (const model of ['google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3.1-8b-instruct:free', 'mistralai/mistral-7b-instruct:free']) {
        try {
          const raw = await callOpenRouter(messages, orKey, model)
          const flashcards = parseFlashcards(raw)
          if (flashcards.length > 0) return NextResponse.json({ flashcards, provider: `openrouter/${model}` })
        } catch (e: any) { console.warn(`[ai-flashcards] ${model} failed:`, e.message) }
      }
      for (const model of ['google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct']) {
        try {
          const raw = await callOpenRouter(messages, orKey, model)
          const flashcards = parseFlashcards(raw)
          if (flashcards.length > 0) return NextResponse.json({ flashcards, provider: `openrouter/${model}` })
        } catch (e: any) { console.warn(`[ai-flashcards] ${model} failed:`, e.message) }
      }
    }

    return NextResponse.json({ error: 'All providers failed' }, { status: 500 })
  } catch (err: any) {
    console.error('[ai-flashcards] Unexpected error:', err)
    return NextResponse.json({ error: 'Flashcard generation failed. Please try again.' }, { status: 500 })
  }
}
