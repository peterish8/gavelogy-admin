import { NextRequest, NextResponse } from 'next/server'

import { PYQ_AI_SYSTEM_PROMPT, parsePyqJson } from '@/lib/pyq-normalized'
import { isAdminRequest, unauthorizedResponse, checkPayloadSize } from '@/lib/admin-auth'

async function callNvidia(messages: any[], apiKey: string): Promise<string> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'moonshotai/kimi-k2.5', messages, max_tokens: 16384, temperature: 0.1 }),
  })
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices[0].message.content as string
}

async function callGroq(messages: any[], apiKey: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens: 8000,
      temperature: 0.1,
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
      Authorization: `Bearer ${apiKey}`,
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

export async function POST(req: NextRequest) {
  if (!isAdminRequest(req)) return unauthorizedResponse()
  const sizeError = checkPayloadSize(req, 500_000)  // 500KB max
  if (sizeError) return sizeError

  try {
    const { pdfText, fileName } = await req.json()

    if (!pdfText?.trim()) {
      return NextResponse.json({ error: 'No PDF text provided' }, { status: 400 })
    }

    const textToProcess = pdfText.length > 14000
      ? pdfText.slice(0, 14000) + '\n\n[... text truncated due to length ...]'
      : pdfText

    const messages = [
      { role: 'system', content: PYQ_AI_SYSTEM_PROMPT },
      {
        role: 'user',
        content: `Extract all MCQ questions from this ${fileName ? `"${fileName}" ` : ''}PDF text. Return ONLY the JSON object with passages[] and questions[]:\n\n${textToProcess}`,
      },
    ]

    const errors: string[] = []
    const nvidiaKey = process.env.NVIDIA_API_KEY
    const groqKey = process.env.GROQ_API_KEY
    const orKey = process.env.OPENROUTER_API_KEY

    let rawResponse: string | null = null

    if (nvidiaKey) {
      try {
        rawResponse = await callNvidia(messages, nvidiaKey)
        console.log('[pyq/parse] NVIDIA success')
      } catch (e: any) {
        errors.push(`NVIDIA: ${e.message}`)
        console.warn('[pyq/parse] NVIDIA failed:', e.message)
      }
    }

    if (!rawResponse && groqKey) {
      try {
        rawResponse = await callGroq(messages, groqKey)
        console.log('[pyq/parse] Groq success')
      } catch (e: any) {
        errors.push(`Groq: ${e.message}`)
        console.warn('[pyq/parse] Groq failed:', e.message)
      }
    }

    if (!rawResponse && orKey) {
      const models = [
        'google/gemini-2.0-flash-001',
        'google/gemini-2.0-flash-exp:free',
        'meta-llama/llama-3.3-70b-instruct',
        'mistralai/mistral-large',
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
        { error: `All AI providers failed - ${errors.join(' | ')}` },
        { status: 500 }
      )
    }

    try {
      const bundle = parsePyqJson(rawResponse)

      if (bundle.questions.length === 0) {
        return NextResponse.json(
          { error: 'AI could not find any questions in this PDF. Try the manual paste method instead.' },
          { status: 422 }
        )
      }

      return NextResponse.json({
        passages: bundle.passages,
        questions: bundle.questions,
        count: bundle.questions.length,
        passage_count: bundle.passages.length,
        truncated: pdfText.length > 14000,
      })
    } catch (e: any) {
      console.error('[pyq/parse] JSON parse failed:', e.message)
      // Security: do NOT return raw AI output — it may leak provider error strings
      return NextResponse.json(
        { error: 'AI returned an unexpected format. Please try again.' },
        { status: 422 }
      )
    }
  } catch (err: any) {
    console.error('[pyq/parse] Unexpected error:', err)
    return NextResponse.json({ error: 'Parse failed. Please try again.' }, { status: 500 })
  }
}
