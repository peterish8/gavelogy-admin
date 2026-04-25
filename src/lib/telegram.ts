import { createClient } from '@supabase/supabase-js'
import { extractPdfText } from '@/lib/pdf-text-extract'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`

// ── Service-role Supabase (bypasses RLS) ──────────────────────────────
// Singleton — reused across calls in same serverless instance for speed
// typed as `any` to avoid losing the ungenericized SupabaseClient overloads
let _sb: any = null
function getServiceSupabase() {
  if (!_sb) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    )
  }
  return _sb as ReturnType<typeof createClient>
}

// ── Raw Telegram API call ─────────────────────────────────────────────
export async function tg(method: string, body: object) {
  const res = await fetch(`${API_BASE}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Connection': 'keep-alive' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  // Suppress benign Telegram errors that are handled by callers
  if (!data.ok && !data.description?.includes('message is not modified')) {
    console.warn(`[tg] ${method} failed:`, data.description)
  }
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
// Falls back to sendMessage if:
//   • messageId is missing/falsy
//   • The message is older than 48 hours (Telegram edit window)
//   • "message is not modified" (identical content — silently ignored)
export async function editMessage(
  chatId: number,
  messageId: number | undefined,
  text: string,
  keyboard?: InlineKeyboardButton[][]
) {
  if (!messageId) {
    return sendMessage(chatId, text, keyboard)
  }
  const res = await tg('editMessageText', {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: 'HTML',
    ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
  })
  // "message is not modified" — benign, nothing changed
  if (!res.ok && res.description?.includes('message is not modified')) return res
  // Message too old to edit (>48h) — send a fresh message instead
  if (!res.ok && (res.description?.includes('message to edit not found') || res.description?.includes('MESSAGE_ID_INVALID'))) {
    return sendMessage(chatId, text, keyboard)
  }
  return res
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

// ── Admin name lookup ─────────────────────────────────────────────────
const ADMIN_NAMES: Record<number, string> = {
  1243366277: 'Aksh',
  6256543340: 'Peter',
}

// ── Session state management (Supabase telegram_sessions) ─────────────
export interface TelegramSession {
  chat_id: number
  state: string   // e.g. 'idle' | 'awaiting_pdf' | 'creating_course_name' | ...
  data: Record<string, any>
  user_name?: string
}

// In-memory cache — survives across requests in the same warm serverless instance
const _sessionCache = new Map<number, TelegramSession>()

export async function getSession(chatId: number): Promise<TelegramSession> {
  if (_sessionCache.has(chatId)) return _sessionCache.get(chatId)!
  const sb = getServiceSupabase()
  const { data } = await sb
    .from('telegram_sessions')
    .select('*')
    .eq('chat_id', chatId)
    .single()
  const session = data ?? { chat_id: chatId, state: 'idle', data: {} }
  _sessionCache.set(chatId, session)
  return session
}

export async function setSession(chatId: number, state: string, data: Record<string, any> = {}) {
  const sb = getServiceSupabase()
  const user_name = ADMIN_NAMES[chatId] ?? `user_${chatId}`
  const session = { chat_id: chatId, state, data, user_name, updated_at: new Date().toISOString() }
  _sessionCache.set(chatId, { chat_id: chatId, state, data, user_name })
  await (sb.from('telegram_sessions') as any).upsert(session, { onConflict: 'chat_id' })
}

export async function clearSession(chatId: number): Promise<void> {
  _sessionCache.set(chatId, { chat_id: chatId, state: 'idle', data: {} })
  const sb = getServiceSupabase()
  const user_name = ADMIN_NAMES[chatId] ?? `user_${chatId}`
  await (sb.from('telegram_sessions') as any).upsert(
    { chat_id: chatId, state: 'idle', data: {}, user_name, updated_at: new Date().toISOString() },
    { onConflict: 'chat_id' }
  )
}

// ── DB row types ──────────────────────────────────────────────────────
export interface CourseRow { id: string; name: string; icon: string | null }
export interface CourseDetailRow { id: string; name: string; icon: string | null; price: number | null; is_active: boolean; description: string | null }
export interface StructureItemRow { id: string; title: string; item_type: string; icon?: string | null }
export interface StructureItemDetailRow { id: string; title: string; item_type: string; course_id: string; parent_id: string | null; pdf_url: string | null }

// ── Database helpers (service role) ──────────────────────────────────
export async function getCourses(): Promise<CourseRow[]> {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('courses')
    .select('id, name, icon')
    .order('order_index', { ascending: true })
  if (error) throw error
  return (data ?? []) as CourseRow[]
}

export async function getTopLevelFolders(courseId: string): Promise<StructureItemRow[]> {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('structure_items')
    .select('id, title, item_type, icon')
    .eq('course_id', courseId)
    .is('parent_id', null)
    .order('order_index', { ascending: true })
  if (error) throw error
  return (data ?? []) as StructureItemRow[]
}

export async function getFolderChildren(folderId: string, courseId: string): Promise<StructureItemRow[]> {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('structure_items')
    .select('id, title, item_type, icon')
    .eq('course_id', courseId)
    .eq('parent_id', folderId)
    .order('order_index', { ascending: true })
  if (error) throw error
  return (data ?? []) as StructureItemRow[]
}

export async function getItem(itemId: string): Promise<StructureItemDetailRow | null> {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('structure_items')
    .select('id, title, item_type, course_id, parent_id, pdf_url')
    .eq('id', itemId)
    .single()
  if (error) return null
  return data as StructureItemDetailRow
}

export async function getNoteContent(itemId: string): Promise<string | null> {
  const sb = getServiceSupabase()
  const { data } = await sb
    .from('note_contents')
    .select('content_html')
    .eq('item_id', itemId)
    .single()
  return (data as any)?.content_html ?? null
}

export async function getExistingContent(itemId: string): Promise<{ hasNotes: boolean; hasQuiz: boolean; hasFlashcards: boolean }> {
  const sb = getServiceSupabase()
  const [noteRes, quizRes] = await Promise.all([
    sb.from('note_contents').select('content_html, flashcards_json').eq('item_id', itemId).maybeSingle(),
    sb.from('attached_quizzes').select('id').eq('note_item_id', itemId).maybeSingle(),
  ])
  const note = (noteRes.data as any)
  return {
    hasNotes: !!(note?.content_html),
    hasQuiz: !!(quizRes.data),
    hasFlashcards: !!(note?.flashcards_json),
  }
}

export async function saveNoteContent(itemId: string, contentHtml: string) {
  const sb = getServiceSupabase()
  await (sb.from('note_contents') as any).upsert(
    { item_id: itemId, content_html: contentHtml, updated_at: new Date().toISOString() },
    { onConflict: 'item_id' }
  )
}

export async function saveFlashcardsContent(itemId: string, flashcards: { front: string; back: string }[]) {
  const sb = getServiceSupabase()
  const json = JSON.stringify(flashcards)
  // Always UPDATE — note_contents row is guaranteed to exist because saveNoteContent runs first.
  // Never upsert here: Supabase upsert would NULL out content_html if not included in payload.
  const { error } = await (sb.from('note_contents') as any)
    .update({ flashcards_json: json, updated_at: new Date().toISOString() })
    .eq('item_id', itemId)
  if (error) console.error('[telegram] saveFlashcardsContent error:', error.message, error.details)
  else console.log('[telegram] saveFlashcardsContent: saved', flashcards.length, 'cards for', itemId)
}

export async function saveQuizContent(itemId: string, quizText: string) {
  const sb = getServiceSupabase()

  // Parse the plain-text quiz into structured questions
  interface QuizOption { letter: string; text: string }
  interface QuizQuestion { questionText: string; options: QuizOption[]; correctAnswer: string; explanation: string }

  function parseQuizText(text: string): { title?: string; questions: QuizQuestion[] } {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const questions: QuizQuestion[] = []
    let cur: Partial<QuizQuestion> | null = null
    let title: string | undefined

    const titleIdx = lines.findIndex(l => /^Title_display\s*:/i.test(l))
    if (titleIdx !== -1) title = lines[titleIdx].replace(/^Title_display\s*:\s*/i, '').trim()

    const firstQ = lines.findIndex(l => /^Q\d*[.:]\s/i.test(l))
    const qLines = firstQ >= 0 ? lines.slice(firstQ) : lines

    for (const line of qLines) {
      const qMatch = line.match(/^Q(\d*)[.:]\s*(.*)/)
      if (qMatch) {
        if (cur?.questionText) questions.push(cur as QuizQuestion)
        cur = { questionText: qMatch[2].trim(), options: [], correctAnswer: '', explanation: '' }
        continue
      }
      const ansMatch = line.match(/^(?:correct_ans|Answer|Correct\s*Answer)\s*:\s*([A-D])/i)
      if (ansMatch && cur) { cur.correctAnswer = ansMatch[1].toUpperCase(); continue }
      const expMatch = line.match(/^Explanation\s*:\s*(.+)/i)
      if (expMatch && cur) { cur.explanation = expMatch[1].trim(); continue }
      const optMatch = line.match(/^([A-D])[.)]\s+(.+)/i)
      if (optMatch && cur && !cur.correctAnswer) {
        cur.options = cur.options ?? []
        cur.options.push({ letter: optMatch[1].toUpperCase(), text: optMatch[2].trim() })
        continue
      }
      if (cur?.explanation) cur.explanation += ' ' + line
    }
    if (cur?.questionText) questions.push(cur as QuizQuestion)
    return { title, questions }
  }

  const parsed = parseQuizText(quizText)
  if (parsed.questions.length === 0) return // nothing to save

  // Upsert attached_quizzes row
  const { data: existing } = await sb
    .from('attached_quizzes')
    .select('id')
    .eq('note_item_id', itemId)
    .maybeSingle()

  let quizId: string
  if (existing) {
    await (sb.from('attached_quizzes') as any)
      .update({ title: parsed.title ?? 'AI Quiz', updated_at: new Date().toISOString() })
      .eq('id', (existing as any).id)
    quizId = (existing as any).id
  } else {
    const { data: newQuiz, error } = await (sb.from('attached_quizzes') as any)
      .insert({ note_item_id: itemId, title: parsed.title ?? 'AI Quiz' })
      .select('id')
      .single()
    if (error || !newQuiz) return
    quizId = (newQuiz as any).id
  }

  // Replace questions
  await (sb.from('quiz_questions') as any).delete().eq('quiz_id', quizId)
  const rows = parsed.questions.map((q, i) => ({
    quiz_id: quizId,
    question_text: q.questionText,
    options: q.options,
    correct_answer: q.correctAnswer,
    explanation: q.explanation,
    order_index: i,
  }))
  if (rows.length > 0) await (sb.from('quiz_questions') as any).insert(rows)
}

export async function getFlashcardsFromDb(itemId: string): Promise<{ front: string; back: string }[] | null> {
  const sb = getServiceSupabase()
  const { data } = await sb
    .from('note_contents')
    .select('flashcards_json')
    .eq('item_id', itemId)
    .single()
  const json = (data as any)?.flashcards_json
  if (!json) return null
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null
  } catch { return null }
}

export async function getQuizFromDb(itemId: string): Promise<{ questionText: string; options: { letter: string; text: string }[]; correctAnswer: string; explanation: string }[] | null> {
  const sb = getServiceSupabase()
  const { data: quiz } = await sb
    .from('attached_quizzes')
    .select('id')
    .eq('note_item_id', itemId)
    .maybeSingle()
  if (!quiz) return null
  const { data: questions } = await sb
    .from('quiz_questions')
    .select('question_text, options, correct_answer, explanation, order_index')
    .eq('quiz_id', (quiz as any).id)
    .order('order_index')
  if (!questions || (questions as any[]).length === 0) return null
  return (questions as any[]).map(q => ({
    questionText: q.question_text,
    options: q.options ?? [],
    correctAnswer: q.correct_answer,
    explanation: q.explanation,
  }))
}

export async function updateItemPdfUrl(itemId: string, pdfUrl: string) {
  const sb = getServiceSupabase()
  await (sb.from('structure_items') as any).update({ pdf_url: pdfUrl }).eq('id', itemId)
}

export async function getCourse(courseId: string): Promise<CourseDetailRow | null> {
  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('courses')
    .select('id, name, icon, price, is_active, description')
    .eq('id', courseId)
    .single()
  if (error) return null
  return data as CourseDetailRow
}

export async function updateCoursePrice(courseId: string, price: number) {
  const sb = getServiceSupabase()
  const { error } = await (sb.from('courses') as any)
    .update({ price, updated_at: new Date().toISOString() })
    .eq('id', courseId)
  if (error) throw error
}

export async function toggleCourseActive(courseId: string): Promise<boolean> {
  const sb = getServiceSupabase()
  const { data } = await sb.from('courses').select('is_active').eq('id', courseId).single()
  const newState = !(data as any)?.is_active
  const { error } = await (sb.from('courses') as any)
    .update({ is_active: newState, updated_at: new Date().toISOString() })
    .eq('id', courseId)
  if (error) throw error
  return newState
}

export async function createCourse(name: string, description: string | null, price: number) {
  const sb = getServiceSupabase()
  const id = crypto.randomUUID()
  const { error } = await (sb.from('courses') as any).insert({
    id, name, description, price, icon: '📚',
    is_active: false, order_index: 0, version: 1,
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
  const { error } = await (sb.from('structure_items') as any).insert({
    id,
    course_id: params.courseId,
    parent_id: params.parentId,
    item_type: params.itemType,
    title: params.title,
    is_active: false, order_index: 0,
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
  // Already a full UUID — return as-is
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(shortId)) {
    return shortId
  }
  // Performance: use a server-side LIKE prefix query instead of fetching all rows.
  // This is O(index) rather than O(n) and scales regardless of table size.
  let lastError: string = 'unknown'
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const sb = getServiceSupabase()
      const { data, error } = await sb
        .from(table)
        .select('id')
        .ilike('id', `${shortId}%`)
        .limit(1)
        .single()
      if (error || !data) {
        lastError = error?.message ?? 'no data'
        continue
      }
      return (data as { id: string }).id
    } catch (e: any) {
      lastError = e.message
      if (attempt < 2) await new Promise(r => setTimeout(r, 300 * (attempt + 1)))
    }
  }
  throw new Error(`[expandId] Could not query "${table}" after 3 attempts: ${lastError}`)
}

// ── Full course structure for AI navigation ───────────────────────────
export interface CourseStructureNote {
  id: string
  title: string
  item_type: 'file'
}

export interface CourseStructureFolder {
  id: string
  title: string
  item_type: 'folder'
  children: (CourseStructureFolder | CourseStructureNote)[]
}

export interface CourseStructureCourse {
  id: string
  name: string
  icon: string | null
  folders: (CourseStructureFolder | CourseStructureNote)[]
}

/**
 * Fetches the full course tree (courses → top-level folders/notes → nested children)
 * for use by the LLM-powered natural language navigation feature.
 * Only goes two levels deep (top-level items + their direct children) to keep
 * the prompt size manageable; deeper nesting is rare in practice.
 */
export async function getCourseStructure(): Promise<CourseStructureCourse[]> {
  const sb = getServiceSupabase()

  // Fetch all courses
  const { data: coursesRaw, error: cErr } = await sb
    .from('courses')
    .select('id, name, icon')
    .order('order_index', { ascending: true })
  if (cErr) throw cErr
  const courses = (coursesRaw ?? []) as { id: string; name: string; icon: string | null }[]

  // Fetch ALL structure items in a single query (more efficient than N+1)
  const { data: allItemsRaw, error: iErr } = await sb
    .from('structure_items')
    .select('id, title, item_type, course_id, parent_id')
    .order('order_index', { ascending: true })
  if (iErr) throw iErr
  const items = (allItemsRaw ?? []) as { id: string; title: string; item_type: string; course_id: string; parent_id: string | null }[]

  // Build a lookup: parentId (or 'root:{courseId}') → children
  function buildChildren(courseId: string, parentId: string | null): (CourseStructureFolder | CourseStructureNote)[] {
    return items
      .filter(i => i.course_id === courseId && (i.parent_id ?? null) === parentId)
      .map(i => {
        if (i.item_type === 'folder') {
          return {
            id: i.id,
            title: i.title,
            item_type: 'folder' as const,
            children: buildChildren(courseId, i.id),
          }
        } else {
          return {
            id: i.id,
            title: i.title,
            item_type: 'file' as const,
          }
        }
      })
  }

  return courses.map(c => ({
    id: c.id,
    name: c.name,
    icon: c.icon,
    folders: buildChildren(c.id, null),
  }))
}

// ── Latest note that has AI-generated content ─────────────────────────
export async function getLatestNoteWithContent(): Promise<{
  id: string; title: string; course_id: string; parent_id: string | null
} | null> {
  const sb = getServiceSupabase()
  const { data: contents } = await sb
    .from('note_contents')
    .select('item_id, updated_at')
    .order('updated_at', { ascending: false })
    .limit(1)
  if (!(contents as any)?.length) return null
  const { data } = await sb
    .from('structure_items')
    .select('id, title, course_id, parent_id')
    .eq('id', (contents as any)[0].item_id)
    .single()
  return (data as any) ?? null
}

// ── Count stats for /status ────────────────────────────────────────────
export async function getStats(): Promise<{
  courses: number; folders: number; notes: number; notesWithContent: number; notesWithPdf: number
}> {
  const sb = getServiceSupabase()
  const results = await Promise.all([
    sb.from('courses').select('*', { count: 'exact', head: true }),
    (sb.from('structure_items') as any).select('*', { count: 'exact', head: true }).eq('item_type', 'folder'),
    (sb.from('structure_items') as any).select('*', { count: 'exact', head: true }).eq('item_type', 'file'),
    sb.from('note_contents').select('*', { count: 'exact', head: true }),
    (sb.from('structure_items') as any).select('*', { count: 'exact', head: true }).eq('item_type', 'file').not('pdf_url', 'is', null),
  ])
  return {
    courses: results[0].count ?? 0,
    folders: results[1].count ?? 0,
    notes: results[2].count ?? 0,
    notesWithContent: results[3].count ?? 0,
    notesWithPdf: results[4].count ?? 0,
  }
}

// ── Strip custom tags from notes HTML for plain-text display ──────────
export function stripTags(html: string): string {
  return html
    // Remove all custom tags including closing variants like [/box:blue], [/hl:#RRGGBB]
    .replace(/\[\/?(h[1-6]|p|b|i|u|li|ul|ol|hr)\]/g, ' ')
    .replace(/\[\/?(box:[a-z]+)\]/g, ' ')
    .replace(/\[\/?(hl:#[0-9A-Fa-f]{6})\]/g, ' ')
    .replace(/\[hl:#[0-9A-Fa-f]{6}\]/g, ' ')
    .replace(/\[hr\]/g, ' ')
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
export { extractPdfText }
