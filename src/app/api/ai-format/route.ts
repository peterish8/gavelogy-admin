import { NextRequest, NextResponse } from 'next/server'
import { isAdminApiRequest, unauthorizedResponse, checkPayloadSize } from '@/lib/admin-auth'

const SYSTEM_PROMPT = `You are a legal study notes formatter for Gavelogy, a law exam prep platform.
You receive raw unformatted notes text and must return it formatted using a specific custom tag system.

CUSTOM TAG SYSTEM:
- [h1]Title[/h1]         → Main heading (case name, act name, topic title)
- [h2]Title[/h2]         → Section heading (Facts, Held, Ratio, Issues, Significance, etc.)
- [h3]Title[/h3]         → Sub-section heading
- [p]Text[/p]            → Regular paragraph
- [b]text[/b]            → Bold (key terms, court names, article/section numbers, party names)
- [i]text[/i]            → Italic (Latin phrases, case citations, statute names)
- [u]text[/u]            → Underline (definitions, first-use of a defined term)
- [hl:#fef08a]text[/hl]  → Yellow highlight (key facts that decided the case)
- [hl:#bbf7d0]text[/hl]  → Green highlight (final judgment / held / positive outcomes)
- [hl:#bfdbfe]text[/hl]  → Blue highlight (core legal principle / ratio decidendi)
- [hl:#fbcfe8]text[/hl]  → Pink highlight (issue / legal question raised)
- [hl:#fed7aa]text[/hl]  → Orange highlight (exception / limitation / dissent / caution)
- [box:blue]...[/box]    → Blue box (general important note or context)
- [box:green]...[/box]   → Green box (exam tip, mnemonic, how to remember)
- [box:amber]...[/box]   → Amber box (watch out / common mistake / caution)
- [box:red]...[/box]     → Red box (critical must-remember point, marked with !! or *)
- [box:violet]...[/box]  → Violet box (related cases / comparison / analogy)
- [ul][li]item[/li][/ul] → Bullet list
- [ol][li]item[/li][/ol] → Numbered list
- [hr]                   → Horizontal divider between major sections

FORMATTING RULES:
1. Wrap all body paragraphs in [p][/p]
2. Use [h2] for standard legal sections: Facts, Issues, Held, Ratio Decidendi, Obiter Dicta, Significance, Test Applied
3. Bold ([b]) every article number (Art. 21, Art. 14), section number, court name, and party name
4. Italic ([i]) for all Latin phrases and case citations written as "X v. Y"
5. Yellow highlight: 2-3 key facts that were decisive
6. Blue highlight: the exact ratio decidendi / core legal principle stated
7. Green highlight: the final holding / judgment sentence
8. Pink highlight: the precise legal question/issue the court addressed
9. Orange highlight: any exception, dissent, or limitation on the ruling
10. Use [box:red] for anything marked !! * IMPORTANT or "MUST KNOW"
11. Use [box:green] for exam tips, tricks, or "remember this as..." type notes
12. Use [box:amber] for "note that", "be careful", "common mistake" type content
13. Use [box:blue] for additional context, background, or "also note" content
14. Use [box:violet] for "compare with", "related to", "distinguished from" content
15. Preserve all original content — do not add or remove information, only format it

IMPORTANT: Return ONLY the formatted content using the tag system above. No explanations, no markdown code blocks, no JSON wrapper. Just the raw tagged content starting directly with the first tag.`

// Calls NVIDIA's Kimi model, the preferred formatter for converting raw notes into tagged Gavelogy markup.
async function callNvidia(messages: any[], apiKey: string, maxTokens = 4000): Promise<string> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'moonshotai/kimi-k2.5', messages, max_tokens: maxTokens, temperature: 0.3 }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

// Calls Groq as a lower-latency fallback for note-formatting requests.
async function callGroq(messages: any[], apiKey: string, maxTokens = 2000): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages, max_tokens: maxTokens, temperature: 0.3 }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

// Calls a chosen OpenRouter model and returns the raw formatted tag output.
async function callOpenRouter(messages: any[], apiKey: string, model: string, maxTokens = 3000): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://gavelogy.com',
      'X-Title': 'Gavelogy Notes AI',
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.3 }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`OpenRouter(${model}) ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

// POST handler: formats raw note text into Gavelogy custom tags with optional extra instructions.
export async function POST(req: NextRequest) {
  if (!(await isAdminApiRequest(req))) return unauthorizedResponse()
  const sizeError = checkPayloadSize(req, 500_000)  // 500KB max
  if (sizeError) return sizeError

  try {
    const { text, instructions } = await req.json()
    if (!text?.trim()) return NextResponse.json({ error: 'No text provided' }, { status: 400 })

    // Builds the user prompt by combining optional formatting instructions with the trimmed source text.
    const userMessage = instructions?.trim()
      ? `Additional formatting instructions:\n${instructions}\n\nFormat these notes:\n\n${text.slice(0, 8000)}`
      : `Format these notes:\n\n${text.slice(0, 8000)}`

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ]

    const errors: string[] = []
    const nvidiaKey = process.env.NVIDIA_API_KEY
    const groqKey = process.env.GROQ_API_KEY
    const orKey = process.env.OPENROUTER_API_KEY

    // 1. NVIDIA Kimi K2.5 — highest priority
    // Tries configured providers in order and returns the first successful formatted response.
    if (nvidiaKey) {
      try {
        const formatted = await callNvidia(messages, nvidiaKey, 4000)
        return NextResponse.json({ formatted, provider: 'nvidia/kimi-k2.5' })
      } catch (e: any) {
        errors.push(`NVIDIA: ${e.message}`)
        console.warn('[ai-format] NVIDIA failed:', e.message)
      }
    }

    if (groqKey) {
      try {
        const formatted = await callGroq(messages, groqKey, 2000)
        return NextResponse.json({ formatted, provider: 'groq' })
      } catch (e: any) {
        errors.push(`Groq: ${e.message}`)
        console.warn('[ai-format] Groq failed:', e.message)
      }
    }

    if (!orKey) return NextResponse.json({ error: `No API keys configured. ${errors.join(' | ')}` }, { status: 500 })

    for (const model of ['google/gemini-2.0-flash-exp:free', 'meta-llama/llama-3.1-8b-instruct:free', 'mistralai/mistral-7b-instruct:free']) {
      try {
        const formatted = await callOpenRouter(messages, orKey, model, 3000)
        return NextResponse.json({ formatted, provider: `openrouter/${model}` })
      } catch (e: any) {
        errors.push(`${model}: ${e.message}`)
        console.warn(`[ai-format] ${model} failed:`, e.message)
      }
    }

    for (const model of ['google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct']) {
      try {
        const formatted = await callOpenRouter(messages, orKey, model, 3000)
        return NextResponse.json({ formatted, provider: `openrouter/${model}` })
      } catch (e: any) {
        errors.push(`${model}: ${e.message}`)
        console.warn(`[ai-format] ${model} failed:`, e.message)
      }
    }

    return NextResponse.json({ error: `All providers failed — ${errors.join(' | ')}` }, { status: 500 })

  } catch (err: any) {
    console.error('[ai-format] Unexpected error:', err)
    return NextResponse.json({ error: 'AI formatting failed. Please try again.' }, { status: 500 })
  }
}
