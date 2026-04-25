import { NextRequest, NextResponse } from 'next/server'
import { isAdminApiRequest, unauthorizedResponse, checkPayloadSize } from '@/lib/admin-auth'
import { GAVELOGY_NOTES_TIPTAP_INSTRUCTIONS } from '@/lib/prompts'

const SYSTEM_PROMPT = `You are Gavelogy's legal notes formatter.
Your task: reformat raw legal notes into Gavelogy bracket-tag format WITHOUT changing substance.

${GAVELOGY_NOTES_TIPTAP_INSTRUCTIONS}

Formatting rules:
1. Keep all original meaning and legal content intact.
2. Do not add new legal claims or citations.
3. Use [h1]/[h2]/[h3] for hierarchy and [p] for body text.
4. Use highlights and boxes only when they improve clarity.
5. Keep output clean and directly pasteable into Gavelogy editor.

Return only the formatted bracket-tag output.`

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
