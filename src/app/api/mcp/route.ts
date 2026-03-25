/**
 * Gavelogy MCP Server — Streamable HTTP transport
 *
 * Exposes case law notes to Claude Desktop (or any MCP client) so you can
 * read, write, and save notes directly from a Claude conversation.
 *
 * Tools exposed:
 *   list_courses          → list all courses
 *   list_items            → list structure_items for a course (cases/sections)
 *   get_note              → fetch note HTML for a structure item
 *   save_note             → save/overwrite note HTML for a structure item
 *
 * Auth: Bearer token via MCP_SECRET_KEY env var (set in .env.local)
 *
 * Claude Desktop config (~\AppData\Roaming\Claude\claude_desktop_config.json):
 * {
 *   "mcpServers": {
 *     "gavelogy": {
 *       "url": "https://YOUR_VERCEL_URL/api/mcp",
 *       "type": "http",
 *       "headers": { "Authorization": "Bearer YOUR_MCP_SECRET_KEY" }
 *     }
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.MCP_SECRET_KEY
  if (!secret) return true // no key set → open (dev only)
  const auth = request.headers.get('authorization') || ''
  return auth === `Bearer ${secret}`
}

// ─── Supabase (service role — bypasses RLS) ───────────────────────────────────

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_courses',
    description: 'List all courses in Gavelogy. Returns id, title, subject for each course.',
    inputSchema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'list_items',
    description:
      'List structure items (cases, sections, chapters) inside a course. ' +
      'Pass a course_id. Returns item id, title, type, and whether a note exists.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'UUID of the course' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'get_note',
    description:
      'Fetch the current note (HTML content) for a structure item. ' +
      'Pass the item_id. Returns the raw HTML including custom tags like <highlight>, <box>, <case-identity>.',
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
    description:
      'Save (overwrite) the note HTML for a structure item. ' +
      'IMPORTANT: preserve custom tags — <highlight color="yellow">, <box>, <case-identity>, <provision>. ' +
      'Pass item_id and the full content_html string.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item' },
        content_html: {
          type: 'string',
          description: 'Full HTML content for the note. Preserve custom tags.',
        },
      },
      required: ['item_id', 'content_html'],
    },
  },
]

// ─── Tool handlers ────────────────────────────────────────────────────────────

async function handleToolCall(name: string, args: Record<string, string>) {
  const db = getDb()

  if (name === 'list_courses') {
    const { data, error } = await db
      .from('courses')
      .select('id, title, subject')
      .order('title')
    if (error) throw new Error(error.message)
    return JSON.stringify(data, null, 2)
  }

  if (name === 'list_items') {
    const { course_id } = args
    if (!course_id) throw new Error('course_id is required')
    const { data, error } = await db
      .from('structure_items')
      .select('id, title, item_type, order_index, note_contents(id)')
      .eq('course_id', course_id)
      .order('order_index')
    if (error) throw new Error(error.message)
    const rows = (data || []).map((item: any) => ({
      id: item.id,
      title: item.title,
      type: item.item_type,
      has_note: Array.isArray(item.note_contents) ? item.note_contents.length > 0 : !!item.note_contents,
    }))
    return JSON.stringify(rows, null, 2)
  }

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

  throw new Error(`Unknown tool: ${name}`)
}

// ─── JSON-RPC dispatcher ──────────────────────────────────────────────────────

async function dispatch(body: any) {
  const { method, params, id } = body

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'gavelogy-admin', version: '1.0.0' },
      },
    }
  }

  if (method === 'notifications/initialized' || method === 'initialized') {
    return null // notification — no response needed
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

  // Support batch requests (array of JSON-RPC calls)
  if (Array.isArray(body)) {
    const results = await Promise.all(body.map(dispatch))
    const responses = results.filter(Boolean)
    return NextResponse.json(responses)
  }

  const result = await dispatch(body)
  if (result === null) {
    return new NextResponse(null, { status: 204 })
  }
  return NextResponse.json(result)
}

// GET — health check / discovery
export async function GET() {
  return NextResponse.json({
    name: 'gavelogy-admin',
    version: '1.0.0',
    description: 'Gavelogy Admin MCP Server — case law notes',
    tools: TOOLS.map((t) => t.name),
  })
}
