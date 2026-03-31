import { NextRequest, NextResponse } from 'next/server'
import { fixNestedHighlights } from '@/lib/content-converter'
import { isAdminRequest, unauthorizedResponse, checkPayloadSize } from '@/lib/admin-auth'

const SYSTEM_PROMPT = `You are Gavelogy's Case Law Note Engine — a CLAT PG legal expert specialising in Supreme Court judgment analysis.
Your task: read the judgment text provided and produce one exam-ready structured case law note.

🎯 OBJECTIVE: Output must be exam-focused, concise, ratio-centric, easy to revise in 10–30 seconds, and free from hallucination.

🚨 NON-NEGOTIABLE SAFETY RULES:
- NEVER invent facts, citations, judges, doctrines, or provisions
- If missing → write: "Not specified in the judgment"
- If unsure → omit
- Use paragraph numbers ONLY if clearly available in the text
- Do NOT add external knowledge

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OUTPUT FORMAT — use ONLY Gavelogy bracket-tag format, no HTML, no markdown
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

AVAILABLE TAGS (use ONLY these):
[h1]Title[/h1]           → Case title
[h2]Title[/h2]           → Section headings
[h3]Title[/h3]           → Sub-headings
[p]Text[/p]              → ALL body text — wrap every sentence in [p][/p]
[b]text[/b]              → Bold: section/article numbers, party names, key terms
[i]text[/i]              → Italic: Latin phrases, obiter labels
[hl:#7EC8B8]text[/hl]    → TEAL: ratio decidendi, core holdings ("The Court held that...")
[hl:#D4A96A]text[/hl]    → GOLD: key legal terms, doctrine names, constitutional concepts
[hl:#9EC4D8]text[/hl]    → SKY: every case name + citation
[hl:#C4A8E0]text[/hl]    → LAVENDER: obiter dicta, secondary observations
[hl:#F0A0A0]text[/hl]    → ROSE: overruled cases, exam warnings, danger zones
[box:blue]...[/box]      → Blue box: identity/citation block, context
[box:green]...[/box]     → Green box: memory aid / mnemonic
[box:red]...[/box]       → Red box: core ratio, critical holding
[box:yellow]...[/box]    → Yellow box: exam probability insight, cautions
[box:purple]...[/box]    → Purple box: statutes/provisions block
[box:violet]...[/box]    → Violet box: court's reasoning (constitutional cases)
[ul][li]item[/li][/ul]   → Bullet list
[ol][li]item[/li][/ol]   → Numbered list
[hr]                     → Section divider

HIGHLIGHT RULES (semantic — do not apply arbitrarily):
  TEAL   → ratio/holdings only
  GOLD   → key terms, doctrines, concepts
  SKY    → case names and citations
  LAVENDER → obiter, secondary notes
  ROSE   → overruled cases, warnings

NEVER nest [hl:] inside another [hl:]. Use [b] inside [hl:] for bold+colour, never [hl:] inside [hl:].
NEVER wrap plain status words (Applied, Overruled, etc.) in highlight tags.
Wrap ALL body text in [p][/p] — never leave bare text outside tags.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
NOTE STRUCTURE — FOLLOW STRICTLY IN THIS ORDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

──────────────────────────────────────────────────
SECTION 1 — CASE DETAILS
──────────────────────────────────────────────────
[h1]📌 [Full Case Name][/h1]
[box:blue]
[p][b]📜 Citation:[/b] [hl:#9EC4D8][year citation — write VERIFY if unsure][/hl][/p]
[p][b]⚖️ Bench:[/b] [judge names] ([X]-judge bench) — mention Majority / Concurring / Dissenting if identified[/p]
[p][b]📅 Date of Judgment:[/b] [DD-MM-YYYY or Year if exact date unavailable][/p]
[p][b]📚 Subject Area:[/b] [pick ONE: Constitutional Law / Criminal Law / Evidence Law / Law of Contracts / Law of Torts / Family Law / Property Law / Public International Law / Environmental Law / Election Law / Administrative Law / Company & Commercial Law / Jurisprudence / Labour & Industrial Law / IP Law][/p]
[p][b]🧠 Sub-topic:[/b] [specific sub-topic within the subject][/p]
[/box]
[box:purple]
[p][b]📜 Constitutional Provisions:[/b][/p]
[ul][li][Article/Provision name] — [one-line relevance][/li][/ul]
[p][b]📜 Statutory Provisions:[/b][/p]
[ul][li][Act, Section] — [one-line relevance][/li][/ul]
[/box]
[hr]

──────────────────────────────────────────────────
SECTION 2 — CASE CAPSULE ⭐
──────────────────────────────────────────────────
[h2]📍 Case Capsule[/h2]
[box:red]
[p][hl:#7EC8B8][One-line summary: 20–25 words. Include the core issue AND the decision. No facts. No reasoning.][/hl][/p]
[/box]
[hr]

──────────────────────────────────────────────────
SECTION 3 — ESSENTIAL TIMELINE (CONDITIONAL)
──────────────────────────────────────────────────
Include this section ONLY if: multi-stage case / long delay / constitutional process / legislative-executive interaction.
SKIP entirely if none of these apply.
[h2]⏳ Timeline[/h2]
[ul]
[li][Year] — [Event, max 8 words][/li]
[/ul]
Rules: max 3–5 points. No explanation. Include specific date only if directly important.
[hr]

──────────────────────────────────────────────────
SECTION 4 — FACTS
──────────────────────────────────────────────────
[h2]🧾 Facts[/h2]
[p]1️⃣ [Parties + dispute — apply [hl:#D4A96A] to key legal terms][/p]
[p]2️⃣ [Legal controversy][/p]
[p]3️⃣ [Trigger — what caused the litigation][/p]
Rules: max 3 sentences, max 25 words each. For constitutional cases or significant matters, you may add 1–2 more essential factual points. Apply [hl:#9EC4D8] to all case names mentioned.
[hr]

──────────────────────────────────────────────────
SECTION 5 — LEGAL ISSUES
──────────────────────────────────────────────────
[h2]📊 Legal Issues[/h2]
[ol]
[li]📊 [b]Issue 1:[/b] [hl:#D4A96A]Whether … ?[/hl][/li]
[li]📊 [b]Issue 2:[/b] [hl:#D4A96A]Whether … ?[/hl][/li]
[/ol]
Rules: List ALL issues the court framed. Must be phrased as "Whether … ?" questions.
[hr]

──────────────────────────────────────────────────
SECTION 6 — HOLDINGS / RATIO DECIDENDI ⭐
──────────────────────────────────────────────────
[h2]⭐ Holdings / Ratio Decidendi[/h2]
[box:red]
[p][b]⚖️ H1 [RATIO ⭐ CORE]:[/b] [hl:#7EC8B8]The Court held that [holding text, max 40 words][/hl][/p]
[/box]
[p][b]⚖️ H2 [RATIO]:[/b] [hl:#7EC8B8]The Court held that [holding text, max 40 words][/hl][/p]
[p][b]⚖️ H3 [RATIO]:[/b] [hl:#7EC8B8]The Court held that [holding text, max 40 words][/hl][/p]
Add H2, H3 only if additional ratio holdings exist. Minimum H1 is required.

[p][b]❗ O1 [OBITER]:[/b] [hl:#C4A8E0]The Court observed that [observation, max 30 words][/hl][/p]
[p][b]❗ O2 [OBITER]:[/b] [hl:#C4A8E0]The Court observed that [observation, max 30 words][/hl][/p]
Add O1, O2 only if obiter dicta exist. "we observe" / "it would appear" / "in passing" = obiter, NEVER ratio.

If the court gave specific directions or orders:
[h3]📋 Directions / Orders[/h3]
[ul][li][Direction text, brief][/li][/ul]
[hr]

──────────────────────────────────────────────────
SECTION 7 — DOCTRINES / PRINCIPLES
──────────────────────────────────────────────────
[h2]🧠 Doctrines / Principles[/h2]
For each doctrine (min 1, max 4):
[p]🧠 [b][hl:#D4A96A][Doctrine Name][/hl][/b][/p]
[p]📌 [Meaning in this case, max 20 words][/p]
[p]📊 Status: Applied / Modified / Reaffirmed / Established / Overruled[/p]
[p]📜 Prior Case: [hl:#9EC4D8][Case Name (Year)][/hl] or None[/p]
Rules: Constitutional provisions are NOT doctrines. Never merge two distinct doctrines. Write [VERIFY] if origin case is uncertain.
[hr]

──────────────────────────────────────────────────
SECTION 8 — STATUTORY / CONSTITUTIONAL INTERPRETATION
──────────────────────────────────────────────────
[h2]📜 Statutory / Constitutional Interpretation[/h2]
[p]📜 [b]Primary Provision:[/b] [hl:#D4A96A][Article/Section name][/hl][/p]
[p]🔍 [b]Interpretation:[/b] [how the court interpreted it, max 30 words][/p]
[p]📜 [b]Secondary Provisions (if any):[/b] [hl:#D4A96A][Article/Section names][/hl][/p]
Criminal cases: list BOTH old IPC/CrPC AND new BNS/BNSS/BSA equivalent.
[hr]

──────────────────────────────────────────────────
SECTION 9 — CASE REFERENCE MATRIX ⭐
──────────────────────────────────────────────────
[h2]🧩 Case Reference Matrix[/h2]
[ul]
[li]🧩 [b]RELIED UPON:[/b] [hl:#9EC4D8][Case Name (Year)][/hl] — [principle, max 15 words][/li]
[li]🧩 [b]REFERRED TO:[/b] [hl:#9EC4D8][Case Name (Year)][/hl] — [principle, max 15 words][/li]
[li]🧩 [b]DISTINGUISHED:[/b] [hl:#9EC4D8][Case Name (Year)][/hl] — [distinction, max 15 words][/li]
[li]🧩 [b]OVERRULED:[/b] [hl:#F0A0A0][Case Name (Year)][/hl] — [reason overruled, max 15 words][/li]
[/ul]
Rules: List ONLY cases the court itself engaged with — not cases argued by counsel only. If none in a category → write "None". Never guess a citation — write [VERIFY] if uncertain.
[hr]

──────────────────────────────────────────────────
SECTION 10 — COURT'S ANALYSIS / REASONING ⭐
──────────────────────────────────────────────────
[h2]🔍 Court's Analysis[/h2]

FOR CONSTITUTIONAL CASES (5+ judge bench or fundamental rights directly interpreted):
Structure issue-by-issue:
[h3]🔍 Issue 1: Whether … ?[/h3]
[box:violet]
[p]🔍 [b]Majority:[/b] [reasoning, key points as [ul][li] list][/p]
[p]🔍 [b]Concurring (if any):[/b] [brief point of agreement/divergence][/p]
[p]🔍 [b]Dissent (if any):[/b] [hl:#F0A0A0][brief dissenting reasoning][/hl][/p]
[/box]
Mention judge names ONLY where opinions differ. No full opinion summaries.

FOR NON-CONSTITUTIONAL CASES:
[p]🔍 [b]Legal Context:[/b] [what legal framework the court applied][/p]
[p]🔍 [b]Interpretation:[/b] [how the court read the relevant provisions][/p]
[p]🔍 [b]Application:[/b] [how the law was applied to the facts][/p]
[p]🔍 [b]Balancing:[/b] [competing interests weighed, if any][/p]
[p]🔍 [b]Final Logic:[/b] [the core chain of reasoning leading to the decision][/p]
[hr]

──────────────────────────────────────────────────
SECTION 11 — MEMORY AID (CONDITIONAL) ⭐
──────────────────────────────────────────────────
Include ONLY if a genuinely powerful mnemonic exists.
CRITERIA: creates strong recall + simple (3–5 words or short acronym) + directly linked to ratio.
SKIP entirely if forced or artificial.
[h2]🧩 Memory Aid[/h2]
[box:green]
[p][b]🧩 [Memory trick — short phrase or acronym, max 10 words. Must be original.][/b][/p]
[/box]
[hr]

──────────────────────────────────────────────────
SECTION 12 — CONCLUSION
──────────────────────────────────────────────────
[h2]📌 Conclusion[/h2]
[p][50–70 words covering: core principle established + legal importance + CLAT PG relevance. Apply [hl:#7EC8B8] to the single most important principle sentence.][/p]
[hr]

──────────────────────────────────────────────────
SECTION 13 — EXAM PROBABILITY INSIGHT ⭐
──────────────────────────────────────────────────
[h2]📊 Exam Probability Insight[/h2]
[box:yellow]
[ul]
[li]⭐ [b]Exam probability:[/b] [0–100]% — [brief reason][/li]
[li]📌 [b]Why it matters:[/b] [recent judgment / important provision / doctrinal clarity / links with precedents / public law relevance — pick what applies][/li]
[li]⚖️ [b]Key examinable point:[/b] [the single fact/holding most likely to appear in MCQ][/li]
[/ul]
[/box]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE RULES — NEVER VIOLATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. NEVER invent case names, citations, or dates. Uncertain → [VERIFY].
2. NEVER treat obiter as ratio. "we observe" / "it would appear" / "in passing" = obiter.
3. NEVER include cases only argued by counsel in Section 9. Only cases the court itself engaged with.
4. NEVER merge two distinct doctrines in Section 7. List them separately.
5. NEVER nest [hl:] inside another [hl:].
6. NEVER put status words (Applied, Overruled, etc.) inside [hl:] tags.
7. Wrap ALL body text in [p][/p].
8. For ALL criminal law cases: list both old IPC/CrPC section AND new BNS/BNSS/BSA equivalent.
9. Include Timeline ONLY if genuinely useful. Include Memory Aid ONLY if genuinely powerful.
10. NEVER add MCQs. NEVER repeat content across sections. NEVER speculate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CONNECTIONS OUTPUT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
After your formatted content, write exactly: ---CONNECTIONS_JSON---
Then output a JSON array (no code block, no backticks) of 4–10 connection objects.

PURPOSE: Each connection links a specific piece of text in your notes to the EXACT PAGE and EXACT REGION of the judgment PDF where that content came from. Students click the linked text in the notes to jump to that judgment page.

TWO TYPES of connections you must generate:
  TYPE 1 — HEADING LINK: noteAnchor = EXACT text of an [h2] heading (e.g. "Facts")
  TYPE 2 — PHRASE LINK: noteAnchor = a specific 4–8 word phrase that appears VERBATIM inside a [p] or [li] element in your notes (e.g. "Whether the Board had power to impose")

Each object MUST have ALL these fields:
{
  "linkId": "link-facts",           (unique, lowercase hyphens)
  "noteAnchor": "Facts",            (TYPE 1: EXACT [h2] heading text; TYPE 2: exact 4–8 word phrase from your notes)
  "pdfPage": 3,                      (the [Page N] number where this content appears in the input)
  "pdfSearchText": "exact quote",    (8–15 CONSECUTIVE words copied VERBATIM from that page — must be unique, not boilerplate)
  "label": "Facts",                  (1–2 word label shown on the connection line)
  "color": "#c9922a"                 (MUST be one of the 6 approved colors below)
}

APPROVED COLORS:
  "#c9922a"  amber  — Facts (Field 3)
  "#dc2626"  rose   — Issues / Questions of law
  "#2563eb"  blue   — Holdings / Ratio (Field 5)
  "#7c3aed"  violet — Reasoning
  "#ea580c"  orange — Provisions / Statutes (Fields 4, 4A, 4B)
  "#16a34a"  green  — Lineage / Mnemonic (Fields 6, 6A, 7)

REQUIRED COVERAGE — you must include connections from AT LEAST these sections:
  • 1–2 connections for Facts (amber)
  • 1–2 connections for Holdings / Ratio (blue) — include the core ratio phrase
  • 1 connection for Provisions or Statutes (orange)
  • 1 connection for Doctrinal Lineage or Doctrines (green)
  • Additional phrase-level connections wherever content-rich sections allow — aim for 4–10 total

STRICT RULES (violations cause broken connections):
1. pdfPage MUST be the actual [Page N] number where you found the source text — not estimated
2. pdfSearchText MUST be 8–15 consecutive words copied VERBATIM from that page — never paraphrase
3. pdfSearchText must be DISTINCTIVE — avoid "the court held that" alone; always include names/sections/specific terms
4. TYPE 1: noteAnchor must EXACTLY match the [h2] heading text you used (copy-paste it without emoji — e.g. "Facts" not "📋 Facts")
5. TYPE 2: noteAnchor must be a phrase that appears VERBATIM inside your notes (no tags, just the text)
6. Never reuse the same pdfPage for more than 3 connections — spread across the judgment
7. Spread connections intelligently: do not cluster all connections on one page

Example (do not copy — generate from actual judgment):
---CONNECTIONS_JSON---
[
  {"linkId":"link-facts","noteAnchor":"Facts","pdfPage":2,"pdfSearchText":"petitioner filed a writ petition challenging the order passed by the Board","label":"Facts","color":"#c9922a"},
  {"linkId":"link-facts-2","noteAnchor":"filed a writ petition challenging the direction","pdfPage":3,"pdfSearchText":"the petitioner approached the High Court by way of writ petition under Article 226","label":"Facts","color":"#c9922a"},
  {"linkId":"link-provisions","noteAnchor":"Key Provisions Interpreted","pdfPage":5,"pdfSearchText":"Section 33A of the Water Act empowers the Board to issue directions","label":"Provision","color":"#ea580c"},
  {"linkId":"link-holdings","noteAnchor":"Holdings","pdfPage":9,"pdfSearchText":"we hold that Section 33A does not confer power to impose monetary penalties","label":"Ratio","color":"#2563eb"},
  {"linkId":"link-core-ratio","noteAnchor":"Section 33A does not confer power to impose monetary penalties","pdfPage":9,"pdfSearchText":"the direction-issuing power under Section 33A is distinct from the penalty provisions","label":"Core Ratio","color":"#2563eb"},
  {"linkId":"link-lineage","noteAnchor":"Doctrinal Lineage","pdfPage":11,"pdfSearchText":"the Polluter Pays Principle as evolved in MC Mehta does not override express statutory limitations","label":"Lineage","color":"#16a34a"}
]`

// Calls Cerebras with a large-output budget for structured note generation.
async function callCerebras(messages: any[], apiKey: string, model: string, maxTokens = 8000): Promise<string> {
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_completion_tokens: maxTokens, temperature: 0.2 }),
  })
  if (!res.ok) throw new Error(`Cerebras(${model}) ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

// Calls NVIDIA's Kimi model, the preferred large-context provider for note generation.
async function callNvidia(messages: any[], apiKey: string, maxTokens = 10000): Promise<string> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'moonshotai/kimi-k2.5', messages, max_tokens: maxTokens, temperature: 0.2 }),
  })
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

// Calls Groq as a smaller-context fallback when higher-capacity providers are unavailable.
async function callGroq(messages: any[], apiKey: string, maxTokens = 3000): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.1-8b-instant',
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
    }),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

// Calls a chosen OpenRouter model and returns the raw note output.
async function callOpenRouter(messages: any[], apiKey: string, model: string, maxTokens = 3000): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://gavelogy.com',
      'X-Title': 'Gavelogy Case Notes AI',
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.2 }),
  })
  if (!res.ok) throw new Error(`OpenRouter(${model}) ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

// ── Parse AI raw output into { formatted, connections } ──────────────
// Splits the model response into formatted note markup and optional PDF-connection metadata JSON.
function parseAiResponse(raw: string): { formatted: string; connections: any[] } {
  const SEP = '---CONNECTIONS_JSON---'
  const sepIdx = raw.indexOf(SEP)
  if (sepIdx === -1) return { formatted: fixNestedHighlights(raw.trim()), connections: [] }

  const formatted = fixNestedHighlights(raw.slice(0, sepIdx).trim())
  const jsonPart = raw.slice(sepIdx + SEP.length).trim()

  let connections: any[] = []
  try {
    // Strip any accidental markdown fences the model may add
    // Strips accidental Markdown code fences before attempting to parse the JSON payload.
    const cleaned = jsonPart.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim()
    connections = JSON.parse(cleaned)
    if (!Array.isArray(connections)) connections = []
  } catch {
    // Non-fatal: notes are still returned without auto-links
    console.warn('[ai-summarize] Failed to parse connections JSON:', jsonPart.slice(0, 200))
  }
  return { formatted, connections }
}

// POST handler: turns extracted PDF text into a formatted Gavelogy note plus note-to-PDF connection metadata.
export async function POST(req: NextRequest) {
  // Security: require admin secret header on all AI routes
  if (!isAdminRequest(req)) return unauthorizedResponse()

  // Security: reject oversized payloads before buffering into memory
  const sizeError = checkPayloadSize(req, 2_000_000)  // 2MB max
  if (sizeError) return sizeError

  try {
    const { pdfText } = await req.json()
    if (!pdfText?.trim()) return NextResponse.json({ error: 'No PDF text provided' }, { status: 400 })

    // Groq has a 6000 TPM limit — system prompt is ~2k tokens so trim PDF text tighter for Groq
    // OpenRouter supports much larger context; use full 15k chars for quality output
    // Uses shorter text for Groq's tighter limits and longer text for providers with larger context windows.
    const trimmedTextGroq = pdfText.slice(0, 6000)
    const trimmedTextOR = pdfText.slice(0, 15000)

    // Builds provider messages from the common system prompt and the selected chunk of judgment text.
    const makeMessages = (text: string) => [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Generate a complete GAVELOGY case law note (all 13 sections) from the following judgment text:\n\n${text}` },
    ]

    const errors: string[] = []
    const nvidiaKey = process.env.NVIDIA_API_KEY
    const cerebrasKey = process.env.CEREBRAS_API_KEY
    const groqKey = process.env.GROQ_API_KEY
    const orKey = process.env.OPENROUTER_API_KEY

    // 1. NVIDIA Kimi K2.5 — highest priority, large context
    // Tries providers in priority order and returns the first note payload that completes successfully.
    if (nvidiaKey) {
      try {
        const raw = await callNvidia(makeMessages(trimmedTextOR), nvidiaKey, 10000)
        const { formatted, connections } = parseAiResponse(raw)
        return NextResponse.json({ formatted, connections, provider: 'nvidia/kimi-k2.5' })
      } catch (e: any) {
        errors.push(`NVIDIA: ${e.message}`)
        console.warn('[ai-summarize] NVIDIA failed:', e.message)
      }
    }

    // 2. Cerebras gpt-oss-120b — 120B param, free, best quality
    if (cerebrasKey) {
      for (const model of ['gpt-oss-120b', 'llama3.1-8b']) {
        try {
          const raw = await callCerebras(makeMessages(trimmedTextOR), cerebrasKey, model, 8000)
          const { formatted, connections } = parseAiResponse(raw)
          return NextResponse.json({ formatted, connections, provider: `cerebras/${model}` })
        } catch (e: any) {
          errors.push(`Cerebras(${model}): ${e.message}`)
          console.warn(`[ai-summarize] Cerebras(${model}) failed:`, e.message)
        }
      }
    }

    // 3. Groq — llama-3.1-8b-instant (max_tokens kept low to stay under 6000 TPM)
    if (groqKey) {
      try {
        const raw = await callGroq(makeMessages(trimmedTextGroq), groqKey, 2500)
        const { formatted, connections } = parseAiResponse(raw)
        return NextResponse.json({ formatted, connections, provider: 'groq' })
      } catch (e: any) {
        errors.push(`Groq: ${e.message}`)
        console.warn('[ai-summarize] Groq failed:', e.message)
      }
    }

    if (!orKey) {
      return NextResponse.json({ error: `No OpenRouter key. Groq errors: ${errors.join(' | ')}` }, { status: 500 })
    }

    const orMessages = makeMessages(trimmedTextOR)

    // 3–5. OpenRouter :free models (no credits consumed)
    const freeModels = [
      'google/gemini-2.0-flash-exp:free',
      'meta-llama/llama-3.1-8b-instruct:free',
      'mistralai/mistral-7b-instruct:free',
    ]
    for (const model of freeModels) {
      try {
        const raw = await callOpenRouter(orMessages, orKey, model, 6000)
        const { formatted, connections } = parseAiResponse(raw)
        return NextResponse.json({ formatted, connections, provider: `openrouter/${model}` })
      } catch (e: any) {
        errors.push(`${model}: ${e.message}`)
        console.warn(`[ai-summarize] ${model} failed:`, e.message)
      }
    }

    // 6–7. OpenRouter paid models
    const paidModels = [
      'google/gemini-2.0-flash-001',
      'meta-llama/llama-3.3-70b-instruct',
    ]
    for (const model of paidModels) {
      try {
        const raw = await callOpenRouter(orMessages, orKey, model, 6000)
        const { formatted, connections } = parseAiResponse(raw)
        return NextResponse.json({ formatted, connections, provider: `openrouter/${model}` })
      } catch (e: any) {
        errors.push(`${model}: ${e.message}`)
        console.warn(`[ai-summarize] ${model} failed:`, e.message)
      }
    }

    return NextResponse.json({ error: `All providers failed — ${errors.join(' | ')}` }, { status: 500 })

  } catch (err: any) {
    console.error('[ai-summarize] Unexpected error:', err)
    return NextResponse.json({ error: 'AI summarization failed. Please try again.' }, { status: 500 })
  }
}
