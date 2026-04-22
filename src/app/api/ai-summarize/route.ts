import { NextRequest, NextResponse } from 'next/server'
import { fixNestedHighlights } from '@/lib/content-converter'
import { isAdminApiRequest, unauthorizedResponse, checkPayloadSize } from '@/lib/admin-auth'
import { JUDGMENT_SYSTEM_PROMPT as SYSTEM_PROMPT } from '@/lib/prompts'

// Calls Cerebras with a large-output budget for structured note generation.
async function callCerebras(messages: any[], apiKey: string, model: string, maxTokens = 8000): Promise<string> {
  const res = await fetch('https://api.cerebras.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, max_completion_tokens: maxTokens, temperature: 0.2 }),
    signal: AbortSignal.timeout(30_000),
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
    signal: AbortSignal.timeout(30_000),
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
    signal: AbortSignal.timeout(20_000),
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
    signal: AbortSignal.timeout(25_000),
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
  // Security: require either admin session auth or the server-to-server secret header.
  if (!(await isAdminApiRequest(req))) return unauthorizedResponse()

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
