import { NextRequest, NextResponse } from 'next/server'
import { isAdminRequest, unauthorizedResponse, checkPayloadSize } from '@/lib/admin-auth'

export const maxDuration = 120  // seconds — Kimi K2.5 is slow, needs headroom

// Creates an AbortSignal timeout so slow provider calls fail cleanly instead of hanging the route.
function withTimeout(ms: number): AbortSignal {
  return AbortSignal.timeout(ms)
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface Provision {
  provision: string       // e.g. "Article 19(1)(a)"
  interpretation: string  // one-line court interpretation, max 20 words
}

interface Holding {
  label: string           // H1, H2, H3 (ratio) or O1, O2, O3 (obiter)
  type: 'ratio' | 'obiter'
  core: boolean           // true for the single most important ratio
  text: string            // "The Court held that..." (ratio) / "The Court observed that..." (obiter)
}

interface Doctrine {
  name: string
  status: string          // Established / Applied / Extended / Modified / Reaffirmed / Overruled / Rejected
  overruled: string       // case name or "None"
  distinguished_from: string  // "Case (Year) — distinction" or "None"
  relied_upon: string[]   // ["Case (Year) — principle applied"]
  lineage_chain: string   // "Case (Year) → Case (Year) → Current"
}

interface McqItem {
  type: 'case_recall' | 'statement_evaluation' | 'application'
  difficulty: 'easy' | 'medium' | 'hard'
  question: string        // for application type, prepend hypothetical facts here
  options: string[]       // ["A. ...", "B. ...", "C. ...", "D. ..."]
  answer: string          // "A" | "B" | "C" | "D"
  explanation: string     // max 50 words, cite H1/O1 etc.
  holding_ref: string     // e.g. "H1" or "H1, O1"
}

interface ArticleItem {
  title: string
  priority: 'HIGH' | 'MEDIUM' | 'LOW'
  exam_probability: string         // "85%"
  exam_probability_reason: string  // max 15 words
  exam_rank: number
  subject: string   // from master list (e.g. "Constitutional Law")
  topic: string     // specific topic (e.g. "Article 19(1)(a) — Freedom of Speech")
  court: string
  keywords: string[]
  capsule: string   // one sentence, max 30 words
  facts: string[]   // exactly 3 sentences
  provisions: Provision[]
  holdings: Holding[]
  doctrine: Doctrine
  mcqs: McqItem[]   // exactly 3: case_recall, statement_evaluation, application
}

// ─── System Prompt ───────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a CLAT PG 2027 legal news analyst for Gavelogy, an Indian law exam prep platform.

You receive raw text from an Indian newspaper. Identify CLAT PG-relevant legal news and produce structured 7-field notes for law students.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — IDENTIFY RELEVANT NEWS (include ONLY):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Supreme Court judgments, orders, observations
- High Court significant rulings
- Constitutional law developments (Articles, fundamental rights, writs)
- Criminal law updates (BNS/BNSS/BSA/IPC/CrPC)
- Civil law changes (CPC, Contract, Torts)
- New Bills introduced, passed, or amended in Parliament
- Legal doctrine developments (ratio decidendi, obiter dicta)
- Statutory interpretation by courts
- Public law matters (environment, election, constitutional bodies)
- Legal rights (personal liberty, bail, free speech, privacy)
- Landmark case references or overruling
- SC/ST Atrocities Act, POCSO, PCMA, and other special laws

SKIP: sports, entertainment, general business, lifestyle, weather, international news without Indian legal angle, personal stories.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — PRIORITY RULES:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HIGH   — Supreme Court judgment / Central Bill / Constitutional Amendment / Art. 21, 19, 14, 32 directly / 5+ judge bench / overruling prior SC judgment / exam probability ≥75%
MEDIUM — High Court judgment with national significance / State legislation / Election Commission order / NGT order / exam probability 40–74%
LOW    — Not SC or national-level HC / no central legislation / exam probability <40% / primarily procedural/administrative

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — EXAM PROBABILITY SCORING (add, cap at 100%):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Court level: SC judgment +35, Constitution Bench (5+) +45, HC national significance +20, Parliament/Legislature +25, Lower court +5
Provision: Art.21 +20, Art.19 +18, Art.14/15/16 +15, Art.32 +15, BNS/BNSS/BSA +15, UAPA +12, IPC classic +10, Env.law +10, Other constitutional +8, Other statutory +5
Doctrine: Overrules SC judgment +20, New doctrine established +18, Extends existing doctrine +15, Reaffirms settled doctrine +10, Applies existing doctrine +8
Recency: Within 3 months +15, within 6 months +10, within 1 year +5
CLAT pattern: Exact topic in PYQ +15, topic in last 2 years +10, in syllabus but new +5
Do not double-count. Cap at 100%.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — PRODUCE JSON for each article:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

SUBJECT must be exactly one of:
Constitutional Law | Criminal Law | Evidence Law | Law of Contracts | Law of Torts | Family Law | Property Law | Public International Law | Environmental Law | Election Law | Administrative Law | Company Law | Jurisprudence | Labour Law | Intellectual Property Law

TOPIC must be the specific sub-topic within subject (e.g. "Article 19(1)(a) — Freedom of Speech and Expression")

COURT format: "Supreme Court of India" | "High Court — [State]" | "Parliament — Lok Sabha" | "Parliament — Rajya Sabha" | "Election Commission of India" | "National Green Tribunal" | "Other — [specify]"

CAPSULE: One sentence, max 30 words. Must state: court + core legal issue + final outcome. Start: "The [court] held that..." or "Parliament introduced a Bill...". No background facts.

FACTS: Exactly 3 sentences (array of 3 strings), max 25 words each:
  facts[0]: Who are the parties and what is the dispute?
  facts[1]: What legal question arose from the situation?
  facts[2]: What event triggered the litigation or news?

PROVISIONS: Array of 2–5 objects. For each: provision name/number + one-line interpretation by court (max 20 words). If news involves criminal law, include BOTH old IPC/CrPC AND new BNS/BNSS equivalent.

HOLDINGS: Array of 1–6 objects.
  RATIO (type:"ratio"): Label H1, H2, H3. Max 40 words. "The Court held that..."
  OBITER (type:"obiter"): Label O1, O2, O3. Max 30 words. "The Court observed that..."
  Set "core":true on exactly ONE ratio (the most exam-critical holding). All others get "core":false.
  Max 3 ratios (H1–H3) + max 3 obiters (O1–O3).

DOCTRINE:
  name: Clear doctrine name (e.g. "Chilling Effect Doctrine", "Sanction for Prosecution Doctrine")
  status: Established / Applied / Extended / Modified / Reaffirmed / Overruled / Rejected
  overruled: Prior case name overruled by this judgment, or "None"
  distinguished_from: "Case (Year) — one-line distinction", or "None"
  relied_upon: Array of strings: "Case (Year) — principle applied" (max 3)
  lineage_chain: "Case (Year) → Case (Year) → Current case" (chronological doctrinal chain)

MCQs: Exactly 3 MCQs — one of each type below. All distractors must be real, plausible alternatives.

  Q1 — CASE RECALL (easy):
    type: "case_recall"
    question: "In which case did the [court] hold that [principle]?" or "Which case established..."
    4 options: A B C D — all real case names from same doctrine area
    Tests: whether student can match case to ratio

  Q2 — STATEMENT EVALUATION (medium):
    type: "statement_evaluation"
    question: "Statement I: [test core ratio H1]\nStatement II: [test an obiter OR lineage fact]"
    4 options must be exactly:
      "A. Both Statement I and Statement II are correct"
      "B. Only Statement I is correct"
      "C. Only Statement II is correct"
      "D. Neither Statement I nor Statement II is correct"
    Tests: precision reading of ratio vs obiter

  Q3 — APPLICATION (hard):
    type: "application"
    question: "Facts: [new hypothetical, genuinely different from actual case, max 60 words]\n\nBased on the ratio of [Case (Year)], the court should:"
    4 options: A B C D — plausible outcomes
    Tests: ability to apply ratio to new fact pattern
    RULE: hypothetical must differ meaningfully from actual case facts

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HARD RULES — NEVER violate:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. NEVER invent case names or citations — write "[VERIFY]" if uncertain
2. NEVER label obiter as ratio — "we observe / it would appear / in passing" = obiter
3. Capsule max 30 words, no background facts
4. Lineage chain required if any prior SC case exists on the same doctrine
5. Q3 Application must use genuinely different hypothetical — never same facts as actual case
6. HIGH priority only for SC judgments or Central legislation
7. Max 5 provisions — pick most exam-relevant
8. One subject, one topic only — if case spans multiple subjects, pick dominant one

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RETURN ONLY a JSON array in triple backticks:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

\`\`\`json
[
  {
    "title": "SC quashes case against Ashoka University professor for social media posts",
    "priority": "HIGH",
    "exam_probability": "82%",
    "exam_probability_reason": "SC judgment on Art. 19(1)(a) with sanction doctrine lineage",
    "exam_rank": 1,
    "subject": "Constitutional Law",
    "topic": "Article 19(1)(a) — Freedom of Speech and Expression",
    "court": "Supreme Court of India",
    "keywords": ["Article 19(1)(a)", "Sanction for Prosecution", "Section 196 BNSS", "Academic Freedom", "Operation Sindoor"],
    "capsule": "The Supreme Court quashed criminal proceedings after Haryana refused prosecution sanction, protecting academic free speech under Article 19(1)(a).",
    "facts": [
      "Ashoka University professor Ali Khan Mahmudabad was arrested by Haryana Police for two social media posts commenting on Operation Sindoor, a military operation.",
      "The legal question was whether criminal prosecution for academic commentary on military affairs required prior sanction under the applicable procedure code.",
      "The Supreme Court intervened after Haryana sat on the sanction question for over six months following the filing of a chargesheet."
    ],
    "provisions": [
      {"provision": "Article 19(1)(a)", "interpretation": "Academic commentary on public affairs is protected speech; prosecution requires prior sanction."},
      {"provision": "Article 21", "interpretation": "Prolonged delay in sanction decision itself prejudices the accused's right to personal liberty."},
      {"provision": "Section 196 BNSS", "interpretation": "Prior sanction is mandatory before prosecuting for speech offences; absence bars proceedings."}
    ],
    "holdings": [
      {"label": "H1", "type": "ratio", "core": true, "text": "The Court held that without prior sanction under BNSS, criminal prosecution for speech-based offences cannot proceed, and State refusal of sanction ends proceedings."},
      {"label": "H2", "type": "ratio", "core": false, "text": "The Court held that prolonged delay in granting or refusing prosecution sanction violates the accused's right to personal liberty under Article 21."},
      {"label": "O1", "type": "obiter", "core": false, "text": "The Court observed that academic commentary must be exercised with prudence, especially when the subject matter is sensitive to national security."},
      {"label": "O2", "type": "obiter", "core": false, "text": "The Court noted that forming a Special Investigation Team for speech acts by academics requires strong and demonstrable justification."}
    ],
    "doctrine": {
      "name": "Sanction for Prosecution Doctrine",
      "status": "Reaffirmed",
      "overruled": "None",
      "distinguished_from": "Romesh Thappar v. State of Madras (1950) — that case dealt with press censorship; this case concerns prosecution sanction, a different legal basis.",
      "relied_upon": [
        "Shreya Singhal v. Union of India (2015) — online speech is protected under Article 19(1)(a)",
        "Romila Thapar v. Union of India (2018) — SIT formation requires strong justification"
      ],
      "lineage_chain": "Romesh Thappar (1950) → Shreya Singhal (2015) → Romila Thapar (2018) → Mahmudabad (2026)"
    },
    "mcqs": [
      {
        "type": "case_recall",
        "difficulty": "easy",
        "question": "In which case did the Supreme Court hold that prior sanction is mandatory before prosecuting a person for speech-based offences under BNSS?",
        "options": ["A. Romesh Thappar v. State of Madras (1950)", "B. Shreya Singhal v. Union of India (2015)", "C. Mahmudabad v. State of Haryana (2026)", "D. Kesavananda Bharati v. State of Kerala (1973)"],
        "answer": "C",
        "explanation": "H1 of Mahmudabad specifically holds that prosecution for speech acts cannot proceed without prior sanction under BNSS. The other cases deal with different aspects of speech law.",
        "holding_ref": "H1"
      },
      {
        "type": "statement_evaluation",
        "difficulty": "medium",
        "question": "Statement I: A court can quash criminal proceedings where the State fails to grant prosecution sanction within a reasonable time.\nStatement II: The right to gender self-identification is protected under Article 21 as held in the Mahmudabad judgment (2026).",
        "options": ["A. Both Statement I and Statement II are correct", "B. Only Statement I is correct", "C. Only Statement II is correct", "D. Neither Statement I nor Statement II is correct"],
        "answer": "B",
        "explanation": "Statement I correctly reflects H2 (delay in sanction violates Art. 21). Statement II is wrong — gender self-identification is from NALSA v. Union of India (2014), not this case.",
        "holding_ref": "H1, H2"
      },
      {
        "type": "application",
        "difficulty": "hard",
        "question": "Facts: A journalist writes an article criticising the army's conduct during a border operation. The State files a criminal complaint for the article without obtaining prior sanction. The journalist approaches the High Court.\n\nBased on the ratio of Mahmudabad v. State of Haryana (2026), the High Court should:",
        "options": ["A. Dismiss the petition as the complaint was validly filed", "B. Quash the proceedings since prior sanction was not obtained", "C. Stay the trial and direct the State to obtain sanction within 30 days", "D. Transfer the matter to the Supreme Court as it involves a constitutional question"],
        "answer": "B",
        "explanation": "H1 of Mahmudabad holds prosecution for speech acts without prior sanction cannot proceed. The ratio applies equally here — same legal issue, same missing prerequisite, same outcome.",
        "holding_ref": "H1"
      }
    ]
  }
]
\`\`\`

Return ONLY the JSON array — no text before or after.`

// ─── Parser ───────────────────────────────────────────────────────────────────

// Parses the model response into article objects, with a few recovery passes for slightly malformed JSON.
function parseArticles(raw: string): ArticleItem[] {
  const match = raw.match(/```json\s*([\s\S]*?)```/)
  let s = match ? match[1].trim() : raw.trim()

  // Falls back to normal JSON parsing first when the model returned a proper fenced array.
  try { return JSON.parse(s) } catch { /* fall through */ }

  // Normalizes smart quotes and trailing commas before retrying JSON.parse.
  s = s
    .replace(/,\s*([}\]])/g, '$1')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
  try { return JSON.parse(s) } catch { /* fall through */ }

  // As a last resort, extracts individual object-looking chunks that contain a title field.
  const recovered: ArticleItem[] = []
  const matches = [...s.matchAll(/\{[\s\S]*?"title"[\s\S]*?\}/g)]
  for (const m of matches) {
    try { recovered.push(JSON.parse(m[0])) } catch { /* skip malformed */ }
  }
  return recovered
}

// ─── AI callers ───────────────────────────────────────────────────────────────

// Calls NVIDIA with the requested model and generous token budget for long-form legal news extraction.
async function callNvidia(messages: any[], apiKey: string, model: string, maxTokens = 12000): Promise<string> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2 }),
    signal: withTimeout(55000),
  })
  if (!res.ok) throw new Error(`NVIDIA(${model}) ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

// Calls Groq with a configurable model for the main news-extraction cascade.
async function callGroq(messages: any[], apiKey: string, model = 'llama-3.3-70b-versatile', maxTokens = 8000): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2 }),
    signal: withTimeout(45000),
  })
  if (!res.ok) throw new Error(`Groq(${model}) ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

// Calls an OpenRouter model for structured article extraction with request timeouts.
async function callOpenRouter(messages: any[], apiKey: string, model: string, maxTokens = 8000): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://gavelogy.com',
      'X-Title': 'Gavelogy News AI',
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2 }),
    signal: withTimeout(25000),
  })
  if (!res.ok) throw new Error(`OpenRouter(${model}) ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

// ─── Handler ─────────────────────────────────────────────────────────────────

// Maps UI model IDs → provider call
// Maps admin-selected model IDs to their underlying provider call and parsed article response.
async function runModel(
  modelId: string,
  messages: any[],
  keys: { nvidia?: string; groq?: string; groq2?: string; or?: string },
): Promise<{ articles: ArticleItem[]; provider: string } | null> {
  const { nvidia, groq: groqKey, groq2, or: orKey } = keys
  try {
    switch (modelId) {
      // ── NVIDIA models ──
      case 'nvidia-kimi':
        if (!nvidia) return null
        return { articles: parseArticles(await callNvidia(messages, nvidia, 'moonshotai/kimi-k2.5', 12000)), provider: 'nvidia/kimi-k2.5' }
      case 'nvidia-nemotron':
        if (!nvidia) return null
        return { articles: parseArticles(await callNvidia(messages, nvidia, 'nvidia/llama-3.3-nemotron-super-49b-v1', 8000)), provider: 'nvidia/nemotron-super-49b' }
      case 'nvidia-llama70b':
        if (!nvidia) return null
        return { articles: parseArticles(await callNvidia(messages, nvidia, 'meta/llama-3.3-70b-instruct', 8000)), provider: 'nvidia/llama-3.3-70b' }
      // ── Groq (70b — fast and free) ──
      case 'groq':
        if (!groqKey) return null
        return { articles: parseArticles(await callGroq(messages, groqKey, 'llama-3.3-70b-versatile', 8000)), provider: 'groq/llama-3.3-70b' }
      case 'groq-scout':
        if (!groqKey) return null
        return { articles: parseArticles(await callGroq(messages, groqKey, 'meta-llama/llama-4-scout-17b-16e-instruct', 8000)), provider: 'groq/llama-4-scout' }
      // ── OpenRouter (use non-free paid endpoint for reliability) ──
      case 'gemini-free':
        if (!orKey) return null
        return { articles: parseArticles(await callOpenRouter(messages, orKey, 'google/gemini-2.0-flash-lite-001', 6000)), provider: 'openrouter/gemini-2.0-flash-lite' }
      case 'gemini-flash':
        if (!orKey) return null
        return { articles: parseArticles(await callOpenRouter(messages, orKey, 'google/gemini-2.5-flash-preview:thinking', 6000)), provider: 'openrouter/gemini-2.5-flash' }
      case 'llama70b-free':
        if (!orKey) return null
        return { articles: parseArticles(await callOpenRouter(messages, orKey, 'meta-llama/llama-3.3-70b-instruct:free', 6000)), provider: 'openrouter/llama-3.3-70b' }
      case 'mistral':
        if (!orKey) return null
        return { articles: parseArticles(await callOpenRouter(messages, orKey, 'mistralai/mistral-small-3.1-24b-instruct:free', 4000)), provider: 'openrouter/mistral-small-24b' }
      default:
        return null
    }
  } catch {
    return null
  }
}

// POST handler: extracts CLAT-relevant legal news articles, ranked and structured for Gavelogy.
export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorizedResponse()
  const sizeError = checkPayloadSize(req, 1_000_000)  // 1MB max
  if (sizeError) return sizeError

  try {
    const body = await req.json()
    const { pdfText, date, sourcePaper, preferredModel } = body
    // Security: cap maxArticles so callers can't request unbounded AI generation
    const maxArticles = Math.min(Math.max(1, Number(body.maxArticles) || 8), 20)
    if (!pdfText?.trim()) return NextResponse.json({ error: 'No PDF text provided' }, { status: 400 })

    // Trims newspaper text to a provider-safe window, then wraps it in the shared system/user prompt pair.
    const trimmedText = pdfText.slice(0, 8000)  // ~2000 tokens of PDF; system prompt + framing takes the rest under Groq's 6000 TPM
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Newspaper: ${sourcePaper || 'Unknown'}\nDate: ${date || 'Unknown'}\n\nExtract up to ${maxArticles} CLAT PG 2027 relevant legal news articles. Rank by exam probability (exam_rank 1 = highest). Produce the complete 7-field Gavelogy note structure for each.\n\nNEWSPAPER TEXT:\n${trimmedText}`,
      },
    ]

    const errors: string[] = []
    const nvidiaKey = process.env.NVIDIA_API_KEY
    const groqKey = process.env.GROQ_API_KEY
    const groqKey2 = process.env.GROQ_API_KEY_2
    const orKey = process.env.OPENROUTER_API_KEY
    const keys = { nvidia: nvidiaKey, groq: groqKey, groq2: groqKey2, or: orKey }

    // If admin picked a specific model, try it first then fall through to auto cascade
    // Honors the admin-picked model first, then falls back to the automatic provider cascade.
    if (preferredModel) {
      const result = await runModel(preferredModel, messages, keys)
      if (result && result.articles.length > 0) {
        return NextResponse.json({ articles: result.articles, provider: result.provider })
      }
      errors.push(`${preferredModel}: failed or 0 articles — falling back to auto cascade`)
      console.warn(`[ai-news] Preferred model "${preferredModel}" failed, continuing cascade`)
    }

    // ── Auto cascade (best → fallback) ────────────────────────────────────────

    // 1. Groq 70b — fast, free, capable (try FIRST now — most reliable)
    // Auto-cascade: try Groq first, then OpenRouter, then NVIDIA as the slowest last resort.
    if (groqKey) {
      for (const [model, label] of [
        ['llama-3.3-70b-versatile',                       'groq/llama-3.3-70b'],
        ['meta-llama/llama-4-scout-17b-16e-instruct',     'groq/llama-4-scout'],
      ] as const) {
        try {
          const raw = await callGroq(messages, groqKey, model, 8000)
          const articles = parseArticles(raw)
          if (articles.length > 0) return NextResponse.json({ articles, provider: label })
          errors.push(`${label}: parsed 0 articles`)
        } catch (e: any) {
          errors.push(`${label}: ${e.message}`)
          console.warn(`[ai-news] ${label} failed:`, e.message)
        }
      }
    }
    if (groqKey2) {
      for (const [model, label] of [
        ['llama-3.3-70b-versatile',                   'groq2/llama-3.3-70b'],
        ['meta-llama/llama-4-scout-17b-16e-instruct', 'groq2/llama-4-scout'],
      ] as const) {
        try {
          const raw = await callGroq(messages, groqKey2, model, 8000)
          const articles = parseArticles(raw)
          if (articles.length > 0) return NextResponse.json({ articles, provider: label })
          errors.push(`${label}: parsed 0 articles`)
        } catch (e: any) {
          errors.push(`${label}: ${e.message}`)
          console.warn(`[ai-news] ${label} failed:`, e.message)
        }
      }
    }

    // 2. OpenRouter — working models (verified alive)
    if (orKey) {
      for (const [model, label, tokens] of [
        ['google/gemini-2.0-flash-lite-001',              'gemini-flash-lite',   6000],
        ['meta-llama/llama-3.3-70b-instruct:free',        'llama-3.3-70b-free',  6000],
        ['google/gemma-3-27b-it:free',                    'gemma-3-27b',         4000],
        ['mistralai/mistral-small-3.1-24b-instruct:free', 'mistral-small-24b',   4000],
        ['microsoft/phi-4:free',                          'phi-4',               4000],
        ['deepseek/deepseek-chat:free',                   'deepseek-chat',       4000],
      ] as [string, string, number][]) {
        try {
          const raw = await callOpenRouter(messages, orKey, model, tokens)
          const articles = parseArticles(raw)
          if (articles.length > 0) return NextResponse.json({ articles, provider: `openrouter/${label}` })
          errors.push(`${label}: parsed 0 articles`)
        } catch (e: any) {
          errors.push(`${label}: ${e.message}`)
          console.warn(`[ai-news] ${label} failed:`, e.message)
        }
      }
    }

    // 3. NVIDIA — last resort (slow, often times out)
    if (nvidiaKey) {
      for (const [model, label] of [
        ['moonshotai/kimi-k2.5',                  'nvidia/kimi-k2.5'],
        ['nvidia/llama-3.3-nemotron-super-49b-v1','nvidia/nemotron-49b'],
        ['meta/llama-3.3-70b-instruct',           'nvidia/llama-3.3-70b'],
      ] as const) {
        try {
          const raw = await callNvidia(messages, nvidiaKey, model, 8000)
          const articles = parseArticles(raw)
          if (articles.length > 0) return NextResponse.json({ articles, provider: label })
          errors.push(`${label}: parsed 0 articles`)
        } catch (e: any) {
          errors.push(`${label}: ${e.message}`)
          console.warn(`[ai-news] ${label} failed:`, e.message)
        }
      }
    }

    if (!nvidiaKey && !orKey && !groqKey && !groqKey2) {
      return NextResponse.json({ error: 'No API keys configured' }, { status: 500 })
    }

    return NextResponse.json({ error: `All providers failed — ${errors.join(' | ')}` }, { status: 500 })

  } catch (err: any) {
    console.error('[ai-news] Unexpected error:', err)
    return NextResponse.json({ error: 'AI news extraction failed. Please try again.' }, { status: 500 })
  }
}
