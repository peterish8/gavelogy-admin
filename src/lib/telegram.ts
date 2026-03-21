import { createClient } from '@supabase/supabase-js'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`

// ── Service-role Supabase (bypasses RLS) ──────────────────────────────
function getServiceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Raw Telegram API call ─────────────────────────────────────────────
export async function tg(method: string, body: object) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) console.warn(`[tg] ${method} failed:`, data.description)
  return data
}

// ── Send a text message with optional inline keyboard ─────────────────
export async function sendMessage(
  chatId: number,
  text: string,
  keyboard?: InlineKeyboardButton[][]
) {
  return tg('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  })
}

// ── Edit an existing message ──────────────────────────────────────────
export async function editMessage(
  chatId: number,
  messageId: number,
  text: string,
  keyboard?: InlineKeyboardButton[][]
) {
  return tg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  })
}

// ── Answer a callback query (removes loading spinner) ─────────────────
export async function answerCallback(callbackQueryId: string, text?: string) {
  return tg('answerCallbackQuery', {
    callback_query_id: callbackQueryId,
    ...(text ? { text, show_alert: false } : {}),
  })
}

// ── Keyboard helpers ──────────────────────────────────────────────────
export interface InlineKeyboardButton {
  text: string
  callback_data: string
}

/**
 * Create an inline keyboard button.
 * Telegram enforces a hard 64-byte limit on callback_data.
 * This function asserts the limit in development so miscoded callback strings
 * are caught immediately rather than silently failing on Telegram's side.
 */
export function btn(text: string, data: string): InlineKeyboardButton {
  const byteLen = Buffer.byteLength(data, 'utf8')
  if (byteLen > 64) {
    // In development throw so the bug is obvious; in production log and truncate
    // to avoid a completely broken button.
    const msg = `[telegram] callback_data exceeds 64 bytes (${byteLen}): "${data}"`
    if (process.env.NODE_ENV === 'development') {
      throw new Error(msg)
    } else {
      console.error(msg)
      // Truncate to 64 bytes on a character boundary
      data = Buffer.from(data, 'utf8').slice(0, 64).toString('utf8')
    }
  }
  return { text, callback_data: data }
}

// Chunk buttons into rows of `perRow`
export function rows(buttons: InlineKeyboardButton[], perRow = 2): InlineKeyboardButton[][] {
  const out: InlineKeyboardButton[][] = []
  for (let i = 0; i < buttons.length; i += perRow) {
    out.push(buttons.slice(i, i + perRow))
  }
  return out
}

// ── Session state management (Supabase telegram_sessions) ─────────────
export interface TelegramSession {
  chat_id: number
  state: string   // e.g. 'idle' | 'awaiting_pdf' | 'creating_course_name' | ...
  data: Record<string, any>
}

export async function getSession(chatId: number): Promise<TelegramSession> {
  const sb = getServiceSupabase()
  const { data } = await sb
    .from('telegram_sessions')
    .select('*')
    .eq('chat_id', chatId)
    .single()
  return data ?? { chat_id: chatId, state: 'idle', data: {} }
}

export async function setSession(chatId: number, state: string, data: Record<string, any> = {}) {
  const sb = getServiceSupabase()
  await sb.from('telegram_sessions').upsert(
    { chat_id: chatId, state, data, updated_at: new Date().toISOString() },
    { onConflict: 'chat_id' }
  )
}

export async function clearSession(chatId: number) {
  await setSession(chatId, 'idle', {})
}

// ── Database helpers (service role) ──────────────────────────────────
export async function getCourses() {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('courses')
    .select('id, name, icon')
    .order('order_index', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getTopLevelFolders(courseId: string) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('structure_items')
    .select('id, title, item_type, icon')
    .eq('course_id', courseId)
    .is('parent_id', null)
    .order('order_index', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getFolderChildren(folderId: string, courseId: string) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('structure_items')
    .select('id, title, item_type, icon')
    .eq('course_id', courseId)
    .eq('parent_id', folderId)
    .order('order_index', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getItem(itemId: string) {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('structure_items')
    .select('id, title, item_type, course_id, parent_id, pdf_url')
    .eq('id', itemId)
    .single()
  if (error) throw error
  return data
}

export async function getNoteContent(itemId: string): Promise<string | null> {
  const sb = getServiceSupabase()
  const { data } = await sb
    .from('note_contents')
    .select('content_html')
    .eq('item_id', itemId)
    .single()
  return data?.content_html ?? null
}

export async function saveNoteContent(itemId: string, contentHtml: string) {
  const sb = getServiceSupabase()
  await sb.from('note_contents').upsert(
    { item_id: itemId, content_html: contentHtml, updated_at: new Date().toISOString() },
    { onConflict: 'item_id' }
  )
}

export async function updateItemPdfUrl(itemId: string, pdfUrl: string) {
  const sb = getServiceSupabase()
  await sb.from('structure_items').update({ pdf_url: pdfUrl }).eq('id', itemId)
}

export async function createCourse(name: string, description: string | null, price: number) {
  const sb = getServiceSupabase()
  const id = crypto.randomUUID()
  const { error } = await sb.from('courses').insert({
    id,
    name,
    description,
    price,
    icon: '📚',
    is_active: false,
    order_index: 0,
    version: 1,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
  return id
}

export async function createStructureItem(params: {
  courseId: string
  parentId: string | null
  itemType: 'folder' | 'file'
  title: string
}) {
  const sb = getServiceSupabase()
  const id = crypto.randomUUID()
  const { error } = await sb.from('structure_items').insert({
    id,
    course_id: params.courseId,
    parent_id: params.parentId,
    item_type: params.itemType,
    title: params.title,
    is_active: false,
    order_index: 0,
    updated_at: new Date().toISOString(),
  })
  if (error) throw error
  return id
}

// ── Short ID helpers (Telegram 64-byte callback_data limit) ───────────
// UUID = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" (36 chars).
// We use the first 8 hex chars of the UUID as a short key.
// UUIDs generated by crypto.randomUUID() have enough entropy in the first
// 8 chars to avoid collisions within any single table.
//
// Byte budget analysis (worst-case compound key):
//   nav_f:{8}:{8}   = 6 + 8 + 1 + 8 = 23 bytes  ✓
//   new_mod:{8}:{8} = 8 + 8 + 1 + 8 = 25 bytes  ✓
//   new_note:{8}:{8}= 9 + 8 + 1 + 8 = 26 bytes  ✓
//   view_menu:{8}   = 10 + 8        = 18 bytes  ✓
//   All well within the 64-byte limit.
export function sid(id: string): string {
  return id.slice(0, 8)
}

/**
 * Expand a short 8-char UUID prefix back to the full UUID.
 * Uses a LIKE prefix query against Supabase.
 * Throws if the record is not found so callers can surface the error
 * rather than silently operating on a truncated ID.
 */
export async function expandId(table: string, shortId: string): Promise<string> {
  // If it's already a full UUID (36 chars with dashes) return it directly —
  // handles any legacy session data that stored the full UUID.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shortId)) {
    return shortId
  }
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from(table)
    .select('id')
    .like('id', shortId + '%')
    .limit(1)
    .single()
  if (error || !data?.id) {
    throw new Error(`[expandId] Could not resolve short ID "${shortId}" in table "${table}": ${error?.message ?? 'not found'}`)
  }
  return data.id
}

// ── Strip custom tags from notes HTML for plain-text display ──────────
export function stripTags(html: string): string {
  return html
    .replace(/\[\/?(h[1-6]|p|b|i|u|li|ul|ol|hr|box:[a-z]+|hl:#[0-9A-Fa-f]{6})\]/g, '')
    .replace(/\[hl:#[0-9A-Fa-f]{6}\]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Truncate text for Telegram (4096 char limit) ──────────────────────
export function truncate(text: string, max = 3800): string {
  if (text.length <= max) return text
  return text.slice(0, max) + '\n\n<i>… truncated (too long for Telegram)</i>'
}

// ── PDF text extraction (Vercel-safe) ────────────────────────────────
// pdf-parse v1.1.1 uses pdfjs-dist internally and tries to access browser
// globals (DOMMatrix, ImageData) that do not exist in Vercel's Lambda
// runtime. The workaround is to polyfill those globals before the module
// is first loaded.
//
// We lazy-require inside the function so the polyfill runs first and so
// that this module can be imported in environments where the PDF path is
// never called (e.g. the Next.js client bundle).
export async function extractPdfText(pdfBuffer: Buffer): Promise<string> {
  // Polyfill browser globals that pdfjs-dist expects in a Node environment.
  if (typeof globalThis.DOMMatrix === 'undefined') {
    // Minimal stub — pdfjs only needs the constructor to not throw.
    // @ts-expect-error — polyfilling browser API on globalThis
    globalThis.DOMMatrix = class DOMMatrix {
      constructor() {
        // no-op stub
      }
    }
  }
  if (typeof globalThis.ImageData === 'undefined') {
    // @ts-expect-error — polyfilling browser API on globalThis
    globalThis.ImageData = class ImageData {
      constructor(public width: number, public height: number) {}
    }
  }
  if (typeof globalThis.Path2D === 'undefined') {
    // @ts-expect-error — polyfilling browser API on globalThis
    globalThis.Path2D = class Path2D {}
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse') as (buf: Buffer, options?: object) => Promise<{ text: string }>

  const parsed = await pdfParse(pdfBuffer, {
    // Disable the test-file check that pdf-parse does on first load —
    // it tries to read a fixture PDF from disk which doesn't exist on Vercel.
    max: 0,
  })

  if (!parsed.text?.trim()) {
    throw new Error('No text extracted from PDF — the file may be scanned/image-based.')
  }
  return parsed.text
}
