/**
 * Gavelogy MCP Server — Streamable HTTP transport
 *
 * Tools:
 *   list_courses          → list all courses
 *   list_items            → list structure_items for a course
 *   search_items          → search items by title keyword
 *   get_item_details      → full metadata for one structure item
 *   get_note              → fetch note content for an item
 *   save_note             → save/overwrite note content
 *   get_note_summary      → plain-text preview of a note (no tags)
 *   get_judgment_text     → extract + return full PDF text server-side
 *   list_quizzes          → list all quizzes
 *   list_flashcards       → get flashcards JSON for an item
 *   save_flashcards       → save flashcards JSON for an item
 *   list_pyq_tests        → list all PYQ mock tests
 *   get_pyq_questions     → get all questions + passages for a PYQ test
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { b2Client, BUCKET } from '@/lib/b2-client'
import { extractPdfText } from '@/lib/telegram'

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.MCP_SECRET_KEY
  if (!secret) return true
  const auth = request.headers.get('authorization') || ''
  return auth === `Bearer ${secret}`
}

// ─── Supabase (service role) ──────────────────────────────────────────────────

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── Note format guide (injected into save_note description) ──────────────────

const NOTE_FORMAT_GUIDE = `
Gavelogy uses a CUSTOM BRACKET-TAG FORMAT. Use ONLY these tags — no raw HTML:

STRUCTURE:
  [h1]Heading[/h1]  [h2]Sub Heading[/h2]  [h3]Section[/h3]
  [p]Paragraph[/p]
  [hr]  ← horizontal divider

INLINE:
  [b]bold[/b]   [i]italic[/i]   [u]underline[/u]
  [hl:#ffff00]yellow[/hl]   [hl:#caffbf]green[/hl]   [hl:#a0c4ff]blue[/hl]
  [hl:#ffd6a5]orange[/hl]   [hl:#ffc6ff]pink[/hl]

COLORED BOXES:
  [box:blue]...[/box]   [box:green]...[/box]   [box:yellow]...[/box]
  [box:red]...[/box]    [box:purple]...[/box]

LISTS:
  [ul][li]item[/li][li]item[/li][/ul]
  [ol][li]first[/li][li]second[/li][/ol]

EXAMPLE CASE LAW NOTE:
  [h2]M.C. Mehta v. Union of India[/h2]
  [box:blue][b]Citation:[/b] AIR 1987 SC 1086[/box]
  [h3]Facts[/h3][p]...[/p]
  [h3]Issue[/h3][p][hl:#ffff00]Key legal question here[/hl][/p]
  [h3]Held[/h3][p]The court held that [b]important principle[/b]...[/p]
  [box:green][b]Ratio:[/b] One-line ratio of the case[/box]
  [h3]Key Principles[/h3]
  [ul][li][hl:#caffbf]Principle 1[/hl][/li][li]Principle 2[/li][/ul]

RULES:
  - Never nest [hl:] inside another [hl:]
  - Never use raw HTML (<strong>, <div>, etc.) — use bracket tags only
  - Always close every tag
  - Use [box:blue] for citations/definitions, [box:green] for ratio/held, [box:yellow] for warnings`

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_courses',
    description: 'List all courses in Gavelogy. Returns id, name, icon, description.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_items',
    description: 'List structure items (cases, sections, chapters) inside a course. Returns id, title, type, has_note, has_pdf.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'UUID of the course' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'search_items',
    description: 'Search structure items by title keyword across all courses (or within one course). Returns matching items with course name.',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Search keyword (case-insensitive)' },
        course_id: { type: 'string', description: 'Optional: limit search to one course UUID' },
      },
      required: ['keyword'],
    },
  },
  {
    name: 'get_item_details',
    description: 'Get full metadata for a single structure item: title, type, parent, order, pdf_url, has_note.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'get_note',
    description: 'Fetch the current note for a structure item in Gavelogy bracket-tag format (e.g. [h2]Title[/h2], [box:blue]...[/box]).',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'save_note',
    description: 'Save (overwrite) a note for a structure item. Content MUST use Gavelogy bracket-tag format — NOT raw HTML.' + NOTE_FORMAT_GUIDE,
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item' },
        content_html: {
          type: 'string',
          description: 'Note in Gavelogy bracket-tag format. Example: [h2]Case Name[/h2][box:blue][b]Citation:[/b] AIR 2001 SC 1[/box][h3]Facts[/h3][p]...[/p]',
        },
      },
      required: ['item_id', 'content_html'],
    },
  },
  {
    name: 'get_note_summary',
    description: 'Get a plain-text summary/preview of a note (all tags stripped). Useful for reading notes without formatting noise.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'get_judgment_text',
    description: 'Extract and return the full text of the PDF judgment attached to a structure item. The PDF is fetched server-side from Backblaze B2 and parsed — Claude receives the plain text directly and can read, summarise, or answer questions about it.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'list_quizzes',
    description: 'List all quizzes in Gavelogy with id, title, description, subject.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_flashcards',
    description: 'Get the flashcards for a structure item. Returns an array of { front, back } cards.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'save_flashcards',
    description: 'Save flashcards for a structure item. Pass an array of { front, back } objects.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item' },
        flashcards: {
          type: 'array',
          description: 'Array of flashcard objects',
          items: {
            type: 'object',
            properties: {
              front: { type: 'string', description: 'Question / term side' },
              back: { type: 'string', description: 'Answer / definition side' },
            },
            required: ['front', 'back'],
          },
        },
      },
      required: ['item_id', 'flashcards'],
    },
  },
  {
    name: 'list_pyq_tests',
    description: 'List all PYQ (Previous Year Question) mock tests with id, title, exam_name, year, question_count, is_published.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_pyq_questions',
    description: 'Get all questions and passages for a PYQ test. Returns passages (with citation, subject) and questions (with options, correct answer, explanation, question_type).',
    inputSchema: {
      type: 'object',
      properties: {
        test_id: { type: 'string', description: 'UUID of the PYQ test' },
      },
      required: ['test_id'],
    },
  },
]

// ─── Helper: strip bracket tags to plain text ─────────────────────────────────

function stripTags(content: string): string {
  return content
    .replace(/\[\/?\w+(?::[^\]]+)?\]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
}

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handleToolCall(name: string, args: Record<string, any>) {
  const db = getDb()

  // ── list_courses ────────────────────────────────────────────────────────────
  if (name === 'list_courses') {
    const { data, error } = await db
      .from('courses')
      .select('id, name, icon, description')
      .order('name')
    if (error) throw new Error(error.message)
    return JSON.stringify(data, null, 2)
  }

  // ── list_items ──────────────────────────────────────────────────────────────
  if (name === 'list_items') {
    const { course_id } = args
    if (!course_id) throw new Error('course_id is required')
    const { data, error } = await db
      .from('structure_items')
      .select('id, title, item_type, order_index, pdf_url, note_contents(id)')
      .eq('course_id', course_id)
      .order('order_index')
    if (error) throw new Error(error.message)
    const rows = (data || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      type: item.item_type,
      has_note: Array.isArray(item.note_contents) ? item.note_contents.length > 0 : !!item.note_contents,
      has_pdf: !!item.pdf_url,
    }))
    return JSON.stringify(rows, null, 2)
  }

  // ── search_items ────────────────────────────────────────────────────────────
  if (name === 'search_items') {
    const { keyword, course_id } = args
    if (!keyword) throw new Error('keyword is required')
    let query = db
      .from('structure_items')
      .select('id, title, item_type, course_id, courses(name)')
      .ilike('title', `%${keyword}%`)
      .order('title')
      .limit(50)
    if (course_id) query = query.eq('course_id', course_id)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const rows = (data || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      type: item.item_type,
      course: (item.courses as any)?.name || item.course_id,
    }))
    return JSON.stringify(rows, null, 2)
  }

  // ── get_item_details ────────────────────────────────────────────────────────
  if (name === 'get_item_details') {
    const { item_id } = args
    if (!item_id) throw new Error('item_id is required')
    const { data, error } = await db
      .from('structure_items')
      .select('id, title, item_type, course_id, parent_id, order_index, pdf_url, note_contents(id), courses(name)')
      .eq('id', item_id)
      .single()
    if (error) throw new Error(error.message)
    const item = data as any
    return JSON.stringify({
      id: item.id,
      title: item.title,
      type: item.item_type,
      course: item.courses?.name || item.course_id,
      course_id: item.course_id,
      parent_id: item.parent_id,
      order_index: item.order_index,
      has_pdf: !!item.pdf_url,
      has_note: Array.isArray(item.note_contents) ? item.note_contents.length > 0 : !!item.note_contents,
    }, null, 2)
  }

  // ── get_note ────────────────────────────────────────────────────────────────
  if (name === 'get_note') {
    const { item_id } = args
    if (!item_id) throw new Error('item_id is required')
    const { data, error } = await db
      .from('note_contents')
      .select('content_html, updated_at')
      .eq('item_id', item_id)
      .single()
    if (error && error.code !== 'PGRST116') throw new Error(error.message)
    if (!data) return '(No note exists for this item yet)'
    return data.content_html || '(Note exists but is empty)'
  }

  // ── save_note ───────────────────────────────────────────────────────────────
  if (name === 'save_note') {
    const { item_id, content_html } = args
    if (!item_id) throw new Error('item_id is required')
    if (content_html === undefined) throw new Error('content_html is required')
    const { error } = await db
      .from('note_contents')
      .upsert(
        { item_id, content_html, updated_at: new Date().toISOString() },
        { onConflict: 'item_id' }
      )
    if (error) throw new Error(error.message)
    return `Note saved successfully for item ${item_id}`
  }

  // ── get_note_summary ────────────────────────────────────────────────────────
  if (name === 'get_note_summary') {
    const { item_id } = args
    if (!item_id) throw new Error('item_id is required')
    const { data, error } = await db
      .from('note_contents')
      .select('content_html, updated_at')
      .eq('item_id', item_id)
      .single()
    if (error && error.code !== 'PGRST116') throw new Error(error.message)
    if (!data?.content_html) return '(No note exists for this item yet)'
    const plain = stripTags(data.content_html)
    const preview = plain.length > 2000 ? plain.slice(0, 2000) + '…' : plain
    return `[Last updated: ${data.updated_at}]\n\n${preview}`
  }

  // ── get_judgment_text ───────────────────────────────────────────────────────
  if (name === 'get_judgment_text') {
    const { item_id } = args
    if (!item_id) throw new Error('item_id is required')

    // 1. Get pdf_url (B2 storage key) from structure_items
    const { data, error } = await db
      .from('structure_items')
      .select('pdf_url, title')
      .eq('id', item_id)
      .single()
    if (error) throw new Error(error.message)
    const item = data as any
    if (!item?.pdf_url) return '(No PDF judgment attached to this item)'

    // 2. Generate a short-lived signed URL to fetch the PDF from B2
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: item.pdf_url })
    const signedUrl = await getSignedUrl(b2Client, command, { expiresIn: 300 })

    // 3. Fetch PDF bytes server-side (Vercel → B2, no browser restriction)
    const res = await fetch(signedUrl)
    if (!res.ok) throw new Error(`Failed to fetch PDF from B2: ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())

    // 4. Extract text using the existing Vercel-safe pdf-parse wrapper
    const text = await extractPdfText(buffer)

    return `=== ${item.title} ===\n\n${text}`
  }

  // ── list_quizzes ────────────────────────────────────────────────────────────
  if (name === 'list_quizzes') {
    const { data, error } = await db
      .from('quizzes')
      .select('id, title, description, order_index, subjects(name)')
      .order('order_index')
    if (error) throw new Error(error.message)
    const rows = (data || []).map((q: any) => ({
      id: q.id,
      title: q.title,
      description: q.description,
      subject: q.subjects?.name || null,
    }))
    return JSON.stringify(rows, null, 2)
  }

  // ── list_flashcards ─────────────────────────────────────────────────────────
  if (name === 'list_flashcards') {
    const { item_id } = args
    if (!item_id) throw new Error('item_id is required')
    const { data, error } = await db
      .from('note_contents')
      .select('flashcards_json')
      .eq('item_id', item_id)
      .single()
    if (error && error.code !== 'PGRST116') throw new Error(error.message)
    if (!data?.flashcards_json) return '(No flashcards saved for this item yet)'
    try {
      const cards = typeof data.flashcards_json === 'string'
        ? JSON.parse(data.flashcards_json)
        : data.flashcards_json
      return JSON.stringify(cards, null, 2)
    } catch {
      return data.flashcards_json as string
    }
  }

  // ── save_flashcards ─────────────────────────────────────────────────────────
  if (name === 'save_flashcards') {
    const { item_id, flashcards } = args
    if (!item_id) throw new Error('item_id is required')
    if (!Array.isArray(flashcards)) throw new Error('flashcards must be an array')
    const json = JSON.stringify(flashcards)
    const { error } = await db
      .from('note_contents')
      .upsert(
        { item_id, flashcards_json: json, updated_at: new Date().toISOString() },
        { onConflict: 'item_id' }
      )
    if (error) throw new Error(error.message)
    return `Saved ${flashcards.length} flashcard(s) for item ${item_id}`
  }

  // ── list_pyq_tests ──────────────────────────────────────────────────────────
  if (name === 'list_pyq_tests') {
    const { data, error } = await db
      .from('pyq_tests')
      .select('id, title, exam_name, year, duration_minutes, total_marks, negative_marking, is_published, created_at, pyq_questions(id)')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    const rows = (data || []).map((t: any) => ({
      id: t.id,
      title: t.title,
      exam_name: t.exam_name,
      year: t.year,
      duration_minutes: t.duration_minutes,
      total_marks: t.total_marks,
      negative_marking: t.negative_marking,
      is_published: t.is_published,
      question_count: Array.isArray(t.pyq_questions) ? t.pyq_questions.length : 0,
    }))
    return JSON.stringify(rows, null, 2)
  }

  // ── get_pyq_questions ───────────────────────────────────────────────────────
  if (name === 'get_pyq_questions') {
    const { test_id } = args
    if (!test_id) throw new Error('test_id is required')
    const [passagesRes, questionsRes] = await Promise.all([
      db.from('pyq_passages')
        .select('id, order_index, passage_text, citation, section_number, subject')
        .eq('test_id', test_id)
        .order('order_index'),
      db.from('pyq_questions')
        .select('id, order_index, passage_id, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, question_type, subject')
        .eq('test_id', test_id)
        .order('order_index'),
    ])
    if (passagesRes.error) throw new Error(passagesRes.error.message)
    if (questionsRes.error) throw new Error(questionsRes.error.message)
    return JSON.stringify({
      passages: passagesRes.data || [],
      questions: questionsRes.data || [],
    }, null, 2)
  }

  throw new Error(`Unknown tool: ${name}`)
}

// ─── JSON-RPC dispatcher ──────────────────────────────────────────────────────

async function dispatch(body: any) {
  const { method, params, id } = body

  if (method === 'initialize') {
    const clientVersion = params?.protocolVersion || '2025-11-25'
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: clientVersion,
        capabilities: { tools: {} },
        serverInfo: { name: 'gavelogy-admin', version: '2.0.0' },
      },
    }
  }

  if (!id || method?.startsWith('notifications/')) {
    return null
  }

  if (method === 'tools/list') {
    return { jsonrpc: '2.0', id, result: { tools: TOOLS } }
  }

  if (method === 'tools/call') {
    const { name, arguments: args } = params || {}
    try {
      const text = await handleToolCall(name, args || {})
      return {
        jsonrpc: '2.0',
        id,
        result: { content: [{ type: 'text', text }] },
      }
    } catch (err: any) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        },
      }
    }
  }

  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` },
  }
}

// ─── Route handlers ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } },
      { status: 400 }
    )
  }

  if (Array.isArray(body)) {
    const results = await Promise.all(body.map(dispatch))
    return NextResponse.json(results.filter(Boolean), {
      headers: { 'Cache-Control': 'no-store' },
    })
  }

  const result = await dispatch(body)
  if (result === null) {
    return new NextResponse(null, { status: 202 })
  }
  return NextResponse.json(result, {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export async function GET() {
  return NextResponse.json({
    name: 'gavelogy-admin',
    version: '2.0.0',
    description: 'Gavelogy Admin MCP Server',
    tools: TOOLS.map((t) => t.name),
  })
}
