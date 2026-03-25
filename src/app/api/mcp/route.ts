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
  [b]bold[/b]   [i]italic[/i]
  [hl:#ffff00]yellow highlight[/hl]   [hl:#caffbf]green highlight[/hl]
  [hl:#a0c4ff]blue highlight[/hl]     [hl:#ffd6a5]orange highlight[/hl]
  [hl:#ffc6ff]pink highlight[/hl]
  ⚠ NEVER use [u]underline[/u] — use highlights instead for emphasis

COLORED BOXES:
  [box:blue]...[/box]    ← citations, definitions, case identity
  [box:green]...[/box]   ← ratio decidendi, held, key ruling
  [box:yellow]...[/box]  ← warnings, important notes, caution
  [box:red]...[/box]     ← dissent, criticism, opposing view
  [box:purple]...[/box]  ← statutes, provisions, bare act text

LISTS:
  [ul][li]item[/li][li]item[/li][/ul]
  [ol][li]first[/li][li]second[/li][/ol]

TABLES (for comparisons, multi-column data):
  [table]
  [tr][th]Column A[/th][th]Column B[/th][th]Column C[/th][/tr]
  [tr][td]Value 1[/td][td]Value 2[/td][td]Value 3[/td][/tr]
  [tr][td]Value 4[/td][td]Value 5[/td][td]Value 6[/td][/tr]
  [/table]
  Use tables for: comparing cases, section-by-section analysis, before/after comparisons.

PDF CONNECTIONS (link note text to PDF judgment pages):
  [link:LABEL]highlighted text that connects to PDF[/link]
  - LABEL is a short descriptive slug: e.g. "holding", "ratio", "sec196", "fir-facts", "court-test"
  - ALWAYS include 5–10 connections per note — they are mandatory, not optional
  - Connect the most important legal phrases, holdings, and key facts
  - Labels must be lowercase, hyphen-separated, max 20 chars
  Example:
    [p]The Court held that [link:main-holding][hl:#caffbf]prior sanction under Section 196 is mandatory[/hl][/link] before cognizance can be taken.[/p]
    [p]The FIR alleged that [link:fir-facts]the poem promoted enmity between religious groups[/link] under Section 153A.[/p]

EXAMPLE CASE LAW NOTE (showing all features):
  [h2]Imran Pratapgadhi v. State of UP (2025)[/h2]
  [box:blue][b]Citation:[/b] 2025 INSC 410 | [b]Bench:[/b] Abhay S. Oka & Ujjal Bhuyan JJ.[/box]
  [box:purple][b]Sections:[/b] IPC 153A, 295A, 298, 504, 505 | CrPC 196, 197[/box]
  [h3]Facts[/h3]
  [p][link:fir-facts]The accused recited a poem at a rally which was alleged to promote communal enmity[/link]. An FIR was registered without prior sanction.[/p]
  [h3]Key Issue[/h3]
  [p][hl:#ffff00]Whether prior sanction under Section 196 CrPC is mandatory before registering an FIR for offences under Sections 153A and 505?[/hl][/p]
  [h3]Held[/h3]
  [p][link:main-holding][hl:#caffbf]Prior sanction under Section 196 is a condition precedent — FIR without it is void ab initio.[/hl][/link][/p]
  [box:green][b]Ratio:[/b] [link:ratio]State cannot bypass the sanction requirement by registering FIR first and seeking sanction later.[/link][/box]
  [h3]Court's Test for Section 153A[/h3]
  [ol]
  [li][link:test-1]Speech must [b]actually promote[/b] enmity — not merely offend[/link][/li]
  [li][link:test-2]Context of speech must be examined holistically[/link][/li]
  [li]Intent to promote disharmony is essential[/li]
  [/ol]
  [h3]Comparison: Section 153A vs 295A[/h3]
  [table]
  [tr][th]Aspect[/th][th]Section 153A[/th][th]295A[/th][/tr]
  [tr][td]Target[/td][td]Groups/communities[/td][td]Religious feelings[/td][/tr]
  [tr][td]Intent needed[/td][td]Yes[/td][td]Yes (deliberate)[/td][/tr]
  [tr][td]Sanction required[/td][td]S.196 CrPC[/td][td]S.196 CrPC[/td][/tr]
  [/table]

RULES:
  - NEVER use [u]...[/u] underline — always use [hl:color] for emphasis
  - Never nest [hl:] inside another [hl:]
  - Never use raw HTML (<strong>, <div>, etc.) — use bracket tags only
  - Always close every tag
  - Always include 5–10 [link:LABEL]...[/link] connections — mandatory for every note
  - Use [box:blue] for citations, [box:green] for ratio/held, [box:purple] for statutes, [box:yellow] for cautions`

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
    description: `Extract and return the text of the PDF judgment attached to a structure item, page by page.

IMPORTANT — HOW TO READ A FULL PDF:
1. Call get_judgment_text with just item_id (no page_from/page_to). The response includes total_pages.
2. If has_more is true, call again with page_from=next_page and page_to=next_page+19 (20-page chunks).
3. Keep looping until has_more is false. You will then have read the entire judgment.

DO NOT ask the user to do this manually — loop through all chunks automatically.

Example loop:
  chunk1 = get_judgment_text(item_id)        → pages 1-20, next_page=21
  chunk2 = get_judgment_text(item_id, 21, 40) → pages 21-40, next_page=41
  chunk3 = get_judgment_text(item_id, 41, 60) → pages 41-60, has_more=false → done`,
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item' },
        page_from: { type: 'number', description: 'Start page (1-indexed, default: 1)' },
        page_to: { type: 'number', description: 'End page inclusive (default: 20). Use chunks of 20 pages.' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'list_quizzes',
    description: 'List all quizzes (attached_quizzes) in Gavelogy with id, title, note_item_id, passing_score.',
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
    name: 'save_quiz',
    description: 'Save/overwrite MCQ questions for an attached quiz. Deletes existing questions and inserts the new ones. Use quiz_id from list_quizzes.',
    inputSchema: {
      type: 'object',
      properties: {
        quiz_id: { type: 'string', description: 'UUID of the attached quiz (from list_quizzes)' },
        title: { type: 'string', description: 'Quiz title to update (optional)' },
        passing_score: { type: 'number', description: 'Passing score percentage e.g. 70 (optional)' },
        questions: {
          type: 'array',
          description: 'Array of MCQ questions to save',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string', description: 'The question text' },
              options: { type: 'array', items: { type: 'string' }, description: 'Array of 4 option strings' },
              correct_index: { type: 'number', description: '0-based index of the correct option' },
              explanation: { type: 'string', description: 'Explanation of the correct answer' },
            },
            required: ['question', 'options', 'correct_index'],
          },
        },
      },
      required: ['quiz_id', 'questions'],
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
    const now = new Date().toISOString()

    // 1. Write to note_contents (the "published" content shown in the website)
    const { error } = await db
      .from('note_contents')
      .upsert(
        { item_id, content_html, updated_at: now },
        { onConflict: 'item_id' }
      )
    if (error) throw new Error(error.message)

    // 2. Also update draft_content_cache so the editor loads the new content
    //    (the editor prioritises draft over note_contents, so old draft would mask our save)
    const { data: existingDraft } = await db
      .from('draft_content_cache')
      .select('id')
      .eq('original_content_id', item_id)
      .maybeSingle()

    if (existingDraft) {
      await db
        .from('draft_content_cache')
        .update({ draft_data: { content_html }, updated_at: now })
        .eq('id', existingDraft.id)
    } else {
      await db
        .from('draft_content_cache')
        .insert({ original_content_id: item_id, draft_data: { content_html } })
    }

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
    const { item_id, page_from = 1, page_to = 20 } = args
    if (!item_id) throw new Error('item_id is required')

    const pageFrom = Math.max(1, Number(page_from))
    const pageTo = Math.max(pageFrom, Number(page_to))

    // 1. Get pdf_url from structure_items
    const { data, error } = await db
      .from('structure_items')
      .select('pdf_url, title')
      .eq('id', item_id)
      .single()
    if (error) throw new Error(error.message)
    const item = data as any
    if (!item?.pdf_url) return '(No PDF judgment attached to this item)'

    // 2. Generate signed URL and fetch PDF bytes from B2
    const command = new GetObjectCommand({ Bucket: BUCKET, Key: item.pdf_url })
    const signedUrl = await getSignedUrl(b2Client, command, { expiresIn: 300 })
    const res = await fetch(signedUrl)
    if (!res.ok) throw new Error(`Failed to fetch PDF from B2: ${res.status}`)
    const buffer = Buffer.from(await res.arrayBuffer())

    // 3. Parse full PDF text (max:0 = all pages)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pdfParse = require('pdf-parse') as (buf: Buffer, opts?: any) => Promise<{ text: string; numpages: number }>
    const parsed = await pdfParse(buffer, { max: 0 })
    const totalPages = parsed.numpages || 1

    if (!parsed.text?.trim()) {
      throw new Error('No text extracted from PDF — the file may be scanned/image-based.')
    }

    // 4. Chunk by character position.
    //    CHUNK_SIZE is chosen so that a 54-page judgment (~180k chars) gives ~54 chunks
    //    matching PDF page numbers 1-1. page_from/page_to map to chunk indices.
    const fullText = parsed.text
    const totalChars = fullText.length
    // Aim for ~totalPages chunks so chunk numbers ≈ page numbers
    const CHUNK_SIZE = Math.max(1000, Math.ceil(totalChars / Math.max(totalPages, 1)))
    const totalChunks = Math.ceil(totalChars / CHUNK_SIZE)

    const chunkFrom = Math.min(pageFrom, totalChunks)
    const chunkTo = Math.min(pageTo, totalChunks)

    const start = (chunkFrom - 1) * CHUNK_SIZE
    const end = chunkTo * CHUNK_SIZE
    const chunkText = fullText.slice(start, end).trim()

    if (!chunkText) {
      return `=== ${item.title} ===\nChunks ${chunkFrom}–${chunkTo} of ${totalChunks} (${totalPages} PDF pages) — no content in this range.\nhas_more: false — END OF DOCUMENT`
    }

    const hasMore = chunkTo < totalChunks
    const nextChunk = hasMore ? chunkTo + 1 : null

    const meta = [
      `=== ${item.title} ===`,
      `Pages: ${chunkFrom}–${chunkTo} of ${totalPages} | chars: ${start}–${Math.min(end, totalChars)}`,
      hasMore
        ? `has_more: true | next_page: ${nextChunk} | Call: get_judgment_text(item_id="${item_id}", page_from=${nextChunk}, page_to=${nextChunk! + 19})`
        : 'has_more: false — END OF DOCUMENT',
      '',
    ].join('\n')

    return meta + chunkText
  }

  // ── list_quizzes ────────────────────────────────────────────────────────────
  if (name === 'list_quizzes') {
    const { data, error } = await db
      .from('attached_quizzes')
      .select('id, title, note_item_id, passing_score, quiz_questions(id)')
      .order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    const rows = (data || []).map((q: any) => ({
      id: q.id,
      title: q.title,
      note_item_id: q.note_item_id,
      passing_score: q.passing_score,
      question_count: Array.isArray(q.quiz_questions) ? q.quiz_questions.length : 0,
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

  // ── save_quiz ────────────────────────────────────────────────────────────────
  if (name === 'save_quiz') {
    const { quiz_id, title, passing_score, questions } = args
    if (!quiz_id) throw new Error('quiz_id is required')
    if (!Array.isArray(questions)) throw new Error('questions must be an array')

    // 1. Optionally update quiz metadata
    if (title !== undefined || passing_score !== undefined) {
      const updates: Record<string, unknown> = {}
      if (title !== undefined) updates.title = title
      if (passing_score !== undefined) updates.passing_score = passing_score
      const { error } = await db.from('attached_quizzes').update(updates).eq('id', quiz_id)
      if (error) throw new Error(`Failed to update quiz metadata: ${error.message}`)
    }

    // 2. Delete existing questions
    const { error: delError } = await db.from('quiz_questions').delete().eq('quiz_id', quiz_id)
    if (delError) throw new Error(`Failed to delete old questions: ${delError.message}`)

    // 3. Insert new questions
    const rows = questions.map((q: any, i: number) => ({
      quiz_id,
      question_text: q.question,
      options: q.options,
      correct_answer: String(q.correct_index),
      explanation: q.explanation || null,
      question_type: 'single_choice',
      order_index: i,
    }))
    const { error: insError } = await db.from('quiz_questions').insert(rows)
    if (insError) throw new Error(`Failed to insert questions: ${insError.message}`)

    return `Saved ${questions.length} question(s) to quiz ${quiz_id}`
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
