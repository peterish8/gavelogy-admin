import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { b2Client, BUCKET } from '@/lib/b2-client'
import {
  sendMessage, editMessage, answerCallback,
  getSession, setSession, clearSession,
  getCourses, getTopLevelFolders, getFolderChildren,
  getItem, getNoteContent, saveNoteContent, saveQuizContent, saveFlashcardsContent, updateItemPdfUrl,
  getExistingContent, getFlashcardsFromDb, getQuizFromDb,
  createCourse, createStructureItem,
  getCourse, updateCoursePrice, toggleCourseActive,
  getCourseStructure, getStats,
  stripTags, truncate, btn, rows, sid, expandId,
  extractPdfText,
} from '@/lib/telegram'

// Security §1: Admin names moved to env var TELEGRAM_ADMIN_NAMES (format: "id:Name,id:Name")
// Set in .env.local: TELEGRAM_ADMIN_NAMES=1243366277:Aksh,6256543340:Peter
const ADMIN_NAMES: Record<number, string> = Object.fromEntries(
  (process.env.TELEGRAM_ADMIN_NAMES ?? '')
    .split(',')
    .filter(Boolean)
    .map(pair => {
      const [id, name] = pair.split(':')
      return [Number(id.trim()), name?.trim() ?? 'Admin']
    })
)

// Supports comma-separated list: e.g. "1243366277,6256543340"
const ADMIN_CHAT_IDS = new Set(
  (process.env.TELEGRAM_ADMIN_CHAT_IDS ?? process.env.TELEGRAM_ADMIN_CHAT_ID ?? '')
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !isNaN(n) && n !== 0)
)

// ── Security: only listed admins can use this bot ─────────────────────
function isAdmin(chatId: number) {
  return ADMIN_CHAT_IDS.size > 0 && ADMIN_CHAT_IDS.has(chatId)
}

// ── Emoji helpers ─────────────────────────────────────────────────────
function itemEmoji(itemType: string) {
  return itemType === 'folder' ? '📁' : '📄'
}

// ═══════════════════════════════════════════════════════════════════════
// NAV SCREENS
// ═══════════════════════════════════════════════════════════════════════

async function showWelcome(chatId: number) {
  await sendMessage(
    chatId,
    '👋 <b>Gavelogy Admin Bot</b>\n\nManage courses, upload judgments, and generate AI content — all from Telegram.\n\nWhat would you like to do?',
    [
      [btn('📚 Browse Courses', 'nav_courses')],
      [btn('➕ New Course', 'new_course')],
    ]
  )
}

async function showCourses(chatId: number, msgId?: number) {
  const courses = await getCourses()
  if (courses.length === 0) {
    const text = '📚 <b>No courses yet.</b>\nCreate your first course!'
    const kb = [[btn('➕ New Course', 'new_course')]]
    if (msgId) {
      await editMessage(chatId, msgId, text, kb)
    } else {
      await sendMessage(chatId, text, kb)
    }
    return
  }
  const text = '📚 <b>Select a Course</b>'
  const kb: ReturnType<typeof btn>[][] = [
    // nav_c:{8} = 6 + 8 = 14 bytes ✓
    ...rows(courses.map(c => btn(`${c.icon ?? '📚'} ${c.name}`, `nav_c:${sid(c.id)}`)), 1),
    [btn('➕ New Course', 'new_course')],
  ]
    if (msgId) {
      await editMessage(chatId, msgId, text, kb)
    } else {
      await sendMessage(chatId, text, kb)
    }
}

async function showCourseSettings(chatId: number, courseId: string, msgId?: number) {
  const course = await getCourse(courseId)
  if (!course) { await sendMessage(chatId, '❌ Course not found.'); return }

  const status = course.is_active ? '🟢 Published' : '🔴 Hidden'
  const text = `⚙️ <b>${course.name} — Settings</b>\n\n💰 Price: ₹${course.price ?? 0}\n📢 Status: ${status}`

  const kb: ReturnType<typeof btn>[][] = [
    [btn(course.is_active ? '🔴 Hide Course' : '🟢 Publish Course', `toggle_pub:${sid(courseId)}`)],
    [btn('💰 Change Price', `edit_price:${sid(courseId)}`)],
    [btn('← Back to Course', `nav_c:${sid(courseId)}`)],
  ]
    if (msgId) {
      await editMessage(chatId, msgId, text, kb)
    } else {
      await sendMessage(chatId, text, kb)
    }
}

async function showCourse(chatId: number, courseId: string, msgId?: number) {
  const items = await getTopLevelFolders(courseId)
  const folders = items.filter(i => i.item_type === 'folder')
  const files = items.filter(i => i.item_type === 'file')
  const all = [...folders, ...files]

  const text = all.length === 0
    ? '📁 <b>No modules yet.</b>\nCreate your first module!'
    : `📁 <b>Modules</b> (${folders.length} folders, ${files.length} notes)`

  const kb: ReturnType<typeof btn>[][] = [
    ...rows(all.map(i => btn(`${itemEmoji(i.item_type)} ${i.title}`,
      i.item_type === 'folder' ? `nav_f:${sid(i.id)}:${sid(courseId)}` : `nav_i:${sid(i.id)}`
    )), 1),
    [btn('📁 New Module', `new_mod:${sid(courseId)}:root`), btn('📄 New Note', `new_note:${sid(courseId)}:root`)],
    [btn('⚙️ Settings', `course_set:${sid(courseId)}`), btn('← Back', 'nav_courses')],
  ]
    if (msgId) {
      await editMessage(chatId, msgId, text, kb)
    } else {
      await sendMessage(chatId, text, kb)
    }
}

async function showFolder(chatId: number, folderId: string, courseId: string, msgId?: number) {
  const items = await getFolderChildren(folderId, courseId)
  const folders = items.filter(i => i.item_type === 'folder')
  const files = items.filter(i => i.item_type === 'file')
  const all = [...folders, ...files]

  const text = all.length === 0
    ? '📁 <b>Empty folder.</b>\nAdd a sub-module or note!'
    : `📁 <b>Contents</b> (${folders.length} folders, ${files.length} notes)`

  const kb: ReturnType<typeof btn>[][] = [
    // nav_f:{8}:{8}  = 23 bytes ✓
    // nav_i:{8}      = 14 bytes ✓
    ...rows(all.map(i => btn(`${itemEmoji(i.item_type)} ${i.title}`,
      i.item_type === 'folder' ? `nav_f:${sid(i.id)}:${sid(courseId)}` : `nav_i:${sid(i.id)}`
    )), 1),
    // new_mod:{8}:{8}  = 8 + 8 + 1 + 8 = 25 bytes ✓
    // new_note:{8}:{8} = 9 + 8 + 1 + 8 = 26 bytes ✓
    [btn('📁 New Module', `new_mod:${sid(courseId)}:${sid(folderId)}`), btn('📄 New Note', `new_note:${sid(courseId)}:${sid(folderId)}`)],
    // nav_c:{8} = 14 bytes ✓
    [btn('← Back', `nav_c:${sid(courseId)}`)],
  ]
    if (msgId) {
      await editMessage(chatId, msgId, text, kb)
    } else {
      await sendMessage(chatId, text, kb)
    }
}

async function showNote(chatId: number, itemId: string, msgId?: number) {
  const item = await getItem(itemId)
  if (!item) { await sendMessage(chatId, '❌ Note not found.'); return }

  const hasPdf = !!item.pdf_url
  const backBtn = btn('← Back', item.parent_id ? `nav_f:${sid(item.parent_id)}:${sid(item.course_id)}` : `nav_c:${sid(item.course_id)}`)

  let text: string
  let kb: ReturnType<typeof btn>[][]

  if (hasPdf) {
    // ── TAG MODE ── PDF attached, AI generation available
    text = `📄 <b>${item.title}</b>\n\n🏷️ <b>Tag Mode</b> — Judgment PDF attached\n\nYou can generate AI notes, quiz and flashcards from the PDF.`
    kb = [
      [btn('🔄 Replace PDF', `act_upload:${sid(itemId)}`)],
      [btn('🤖 Generate AI (Notes + Quiz + Flashcards)', `act_ai:${sid(itemId)}`)],
      [btn('👁️ View Content', `view_menu:${sid(itemId)}`)],
      [btn('📝 Switch to Notes Mode', `mode_notes:${sid(itemId)}`), backBtn],
    ]
  } else {
    // ── NOTES MODE ── No PDF, text content only
    text = `📄 <b>${item.title}</b>\n\n📝 <b>Notes Mode</b> — No judgment PDF\n\nUpload a PDF to switch to Tag Mode and enable AI generation.`
    kb = [
      [btn('📤 Upload PDF → switches to Tag Mode', `act_upload:${sid(itemId)}`)],
      [btn('👁️ View Notes', `view_n:${sid(itemId)}`)],
      [backBtn],
    ]
  }

    if (msgId) {
      await editMessage(chatId, msgId, text, kb)
    } else {
      await sendMessage(chatId, text, kb)
    }
}

async function showViewMenu(chatId: number, itemId: string, msgId?: number) {
  const text = '👁️ <b>What would you like to view?</b>'
  const kb = [
    // view_n:{8} = 7 + 8 = 15 bytes ✓
    [btn('📝 Notes', `view_n:${sid(itemId)}`)],
    // view_q:{8} = 7 + 8 = 15 bytes ✓
    [btn('❓ Quiz (generate on demand)', `view_q:${sid(itemId)}`)],
    // view_f:{8} = 7 + 8 = 15 bytes ✓
    [btn('🃏 Flashcards (generate on demand)', `view_f:${sid(itemId)}`)],
    // nav_i:{8}  = 6 + 8 = 14 bytes ✓
    [btn('← Back', `nav_i:${sid(itemId)}`)],
  ]
    if (msgId) {
      await editMessage(chatId, msgId, text, kb)
    } else {
      await sendMessage(chatId, text, kb)
    }
}

// ═══════════════════════════════════════════════════════════════════════
// SLASH COMMAND SCREENS
// ═══════════════════════════════════════════════════════════════════════

async function showHelp(chatId: number) {
  await sendMessage(
    chatId,
    `📖 <b>Gavelogy Bot — Commands</b>\n\n` +
    `/start — Home screen\n` +
    `/help — This help message\n` +
    `/courses — Browse all courses\n` +
    `/new — Quick create menu\n` +
    `/newcourse — Create a new course\n` +
    `/newmodule — Create a module (picks course)\n` +
    `/newnote — Create a note (picks course)\n` +
    `/generate — Generate AI (picks course → note)\n` +
    `/upload — Upload PDF (picks course → note)\n` +
    `/publish — Publish/hide a course\n` +
    `/price — Change a course price\n` +
    `/status — Platform stats\n` +
    `/me — Your admin info\n\n` +
    `<i>Or just type naturally — "go to civil law", "upload pdf for rajeeb note"</i>`,
    [[btn('📚 Browse Courses', 'nav_courses'), btn('➕ New Course', 'new_course')]]
  )
}

async function showNewMenu(chatId: number) {
  await sendMessage(
    chatId,
    '➕ <b>What would you like to create?</b>',
    [
      [btn('📚 New Course', 'new_course')],
      [btn('📁 New Module', 'sc_pick:mod'), btn('📄 New Note', 'sc_pick:note')],
    ]
  )
}

async function showStatus(chatId: number) {
  const stats = await getStats()
  const pct = stats.notes > 0 ? Math.round((stats.notesWithContent / stats.notes) * 100) : 0
  await sendMessage(
    chatId,
    `📊 <b>Platform Stats</b>\n\n` +
    `📚 Courses: <b>${stats.courses}</b>\n` +
    `📁 Modules: <b>${stats.folders}</b>\n` +
    `📄 Notes: <b>${stats.notes}</b>\n` +
    `📎 Notes with PDF: <b>${stats.notesWithPdf}</b>\n` +
    `🤖 Notes with AI content: <b>${stats.notesWithContent}</b> (${pct}%)\n`,
    [[btn('📚 Browse Courses', 'nav_courses')]]
  )
}

async function showMe(chatId: number) {
  const name = ADMIN_NAMES[chatId] ?? 'Admin'
  await sendMessage(
    chatId,
    `👤 <b>Your Info</b>\n\nName: <b>${name}</b>\nChat ID: <code>${chatId}</code>\nRole: Admin`,
    [[btn('🏠 Home', 'nav_home')]]
  )
}

// ── Pick a course, then show all its notes for generate/upload ─────────
async function showPickCourseFor(chatId: number, action: 'gen' | 'upload' | 'mod' | 'note') {
  const courses = await getCourses()
  if (courses.length === 0) {
    await sendMessage(chatId, '📚 No courses yet. Create one first!', [[btn('➕ New Course', 'new_course')]])
    return
  }
  const label =
    action === 'gen' ? '🤖 Generate AI' :
    action === 'upload' ? '📤 Upload PDF' :
    action === 'mod' ? '📁 New Module' : '📄 New Note'
  await sendMessage(
    chatId,
    `${label} — <b>Pick a course first:</b>`,
    [
      ...rows(courses.map(c => btn(`${c.icon ?? '📚'} ${c.name}`, `sc_pick_c:${action}:${sid(c.id)}`)), 1),
    ]
  )
}

// ═══════════════════════════════════════════════════════════════════════
// AI GENERATION
// ═══════════════════════════════════════════════════════════════════════

// Formats error messages to show which models failed
// Input: "All providers failed — NVIDIA: 429 | Groq: rate limit | OpenRouter: 503"
// Output: "📝 Notes ❌ NVIDIA·Groq·OpenRouter all failed"
function formatProviderError(label: string, errMsg: string): string {
  // Extract individual provider failures from the chain error
  const chain = errMsg.match(/All providers failed[^:]*[:\-]\s*(.+)/i)?.[1]
  if (chain) {
    const models = chain.split('|').map(s => s.trim().split(':')[0].trim()).filter(Boolean)
    return `${label} ❌ <code>${models.join(' → ')}</code> all failed`
  }
  // Single model error — show raw but truncated
  return `${label} ❌ <code>${errMsg.slice(0, 60)}</code>`
}

// ── AI confirm: ask one item at a time ───────────────────────────────
// pendingChecks: array of 'notes'|'quiz'|'cards' that still need a yes/no
async function askNextAiConfirm(chatId: number) {
  const session = await getSession(chatId)
  if (session.state !== 'ai_confirm') return
  const { itemId, pending, skipNotes, skipQuiz, skipCards } = session.data as {
    itemId: string
    pending: string[]
    skipNotes: boolean
    skipQuiz: boolean
    skipCards: boolean
  }

  if (pending.length === 0) {
    // All questions answered — fire generation
    clearSession(chatId)
    await handleGenerateAi(chatId, itemId, skipNotes, skipQuiz, skipCards)
    return
  }

  const current = pending[0]
  const labels: Record<string, string> = {
    notes: '📝 Notes',
    quiz:  '❓ Quiz',
    cards: '🃏 Flashcards',
  }
  const label = labels[current]
  // ai_yn:y:{8} = 16 bytes ✓  ai_yn:n:{8} = 16 bytes ✓
  await sendMessage(
    chatId,
    `${label} already exists for this note.\n\n<b>Overwrite with new AI-generated ${label.slice(3)}?</b>`,
    [
      [btn('✅ Yes, overwrite', `ai_yn:y:${sid(itemId)}`), btn('❌ No, keep it', `ai_yn:n:${sid(itemId)}`)],
    ]
  )
}

async function handleGenerateAi(
  chatId: number,
  itemId: string,
  skipNotes = false,
  skipQuiz = false,
  skipCards = false,
) {
  const item = await getItem(itemId)
  if (!item) { await sendMessage(chatId, '❌ Note not found.'); return }
  if (!item.pdf_url) {
    await sendMessage(chatId, '❌ No PDF attached. Upload a PDF first (Tag Mode).', [
      [btn('← Back to Note', `nav_i:${itemId}`)],
    ])
    return
  }

  // ── Pre-flight: check what already exists — ask one by one ─────────
  // Only on first call (all skip flags are false = fresh trigger)
  if (!skipNotes && !skipQuiz && !skipCards) {
    const existing = await getExistingContent(itemId)
    // Build list of items that exist and need a yes/no question
    const pending = [
      existing.hasNotes     ? 'notes' : null,
      existing.hasQuiz      ? 'quiz'  : null,
      existing.hasFlashcards ? 'cards' : null,
    ].filter(Boolean) as string[]

    if (pending.length > 0) {
      await setSession(chatId, 'ai_confirm', {
        itemId,
        pending,
        skipNotes: false,
        skipQuiz: false,
        skipCards: false,
      })
      await askNextAiConfirm(chatId)
      return
    }
  }

  clearSession(chatId)

  // Live progress log — each line is appended and message is edited in real time
  const log: string[] = [`🤖 <b>AI Generation — ${item.title}</b>\n`]
  const progressMsg = await sendMessage(chatId, log.join('\n'))
  const msgId = progressMsg?.result?.message_id
  const update = async () => { if (msgId) await editMessage(chatId, msgId, log.join('\n')) }

  const elapsed = (start: number) => `${Math.round((Date.now() - start) / 1000)}s`

  const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')

  // ── STEP 3: Notes ──────────────────────────────────────────────────
  // Quiz and flashcards are generated FROM NOTES, not from the PDF.
  // PDF is only fetched/extracted when notes need to be (re)generated.
  let notesText = ''
  if (skipNotes) {
    // Notes skipped — load existing notes from DB for quiz/flashcards to use
    const existing = await getNoteContent(itemId)
    if (existing) notesText = stripTags(existing)
    log.push('📝 <b>Notes</b> — skipped (using existing)')
    await update()
  } else {
    // Need to generate notes → fetch PDF first
    log.push('📥 Fetching PDF…')
    await update()
    let pdfBuffer: Buffer
    try {
      const t = Date.now()
      const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: item.pdf_url! })
      const signedUrl = await getSignedUrl(b2Client, cmd, { expiresIn: 300 })
      const res = await fetch(signedUrl)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      pdfBuffer = Buffer.from(await res.arrayBuffer())
      log[log.length - 1] = `📥 PDF fetched ✅ · ${elapsed(t)}`
      await update()
    } catch (e: any) {
      log[log.length - 1] = `📥 PDF fetch ❌ — ${e.message}`
      await update()
      await sendMessage(chatId, '❌ Could not fetch PDF. Please try again.', [[btn('← Back', `nav_i:${itemId}`)]])
      return
    }

    log.push('📄 Extracting text…')
    await update()
    let pdfText: string
    try {
      const t = Date.now()
      pdfText = await extractPdfText(pdfBuffer)
      const words = pdfText.split(/\s+/).length
      log[log.length - 1] = `📄 Text extracted ✅ · ${words.toLocaleString()} words · ${elapsed(t)}`
      await update()
    } catch (e: any) {
      log[log.length - 1] = `📄 Text extraction ❌ — ${e.message}`
      await update()
      await sendMessage(chatId, '❌ PDF may be scanned/image-based. Cannot extract text.', [[btn('← Back', `nav_i:${itemId}`)]])
      return
    }

    log.push('📝 <b>Notes</b> — generating…')
    await update()
    try {
      const t = Date.now()
      const res = await fetch(`${baseUrl}/api/ai-summarize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Security: internal call must include admin secret so the route accepts it
          'x-admin-secret': process.env.ADMIN_API_SECRET ?? '',
        },
        body: JSON.stringify({ pdfText }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'failed')
      await saveNoteContent(itemId, data.formatted)
      notesText = stripTags(data.formatted)
      log[log.length - 1] = `📝 <b>Notes</b> ✅ <code>${data.provider ?? 'unknown'}</code> · ${elapsed(t)}`
      await update()
    } catch (e: any) {
      log[log.length - 1] = formatProviderError('📝 <b>Notes</b>', e.message)
      await update()
      await sendMessage(chatId, '❌ Notes generation failed. Cannot continue.', [[btn('← Back', `nav_i:${itemId}`)]])
      return
    }
  }

  // ── STEP 4: Quiz ───────────────────────────────────────────────────
  if (skipQuiz) {
    log.push('❓ <b>Quiz</b> — skipped (kept existing)')
    await update()
  } else {
    log.push('❓ <b>Quiz</b> — generating…')
    await update()
    try {
      const t = Date.now()
      const res = await fetch(`${baseUrl}/api/ai-quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': process.env.ADMIN_API_SECRET ?? '',
        },
        body: JSON.stringify({ notesText }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'failed')
      if (!data.quiz) throw new Error('Quiz response missing quiz field')
      const quizCount = (data.quiz as string).match(/^Q\d+\./gm)?.length ?? 10
      saveQuizContent(itemId, data.quiz as string).catch(e => console.warn('[telegram] saveQuiz failed:', e.message))
      log[log.length - 1] = `❓ <b>Quiz</b> ✅ <code>${data.provider ?? 'unknown'}</code> · ${quizCount} Qs · ${elapsed(t)}`
      await update()
    } catch (e: any) {
      log[log.length - 1] = formatProviderError('❓ <b>Quiz</b>', e.message) + ' (skipped)'
      await update()
    }
  }

  // ── STEP 5: Flashcards ─────────────────────────────────────────────
  if (skipCards) {
    log.push('🃏 <b>Flashcards</b> — skipped (kept existing)')
    await update()
  } else {
    log.push('🃏 <b>Flashcards</b> — generating…')
    await update()
    try {
      const t = Date.now()
      const res = await fetch(`${baseUrl}/api/ai-flashcards`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': process.env.ADMIN_API_SECRET ?? '',
        },
        body: JSON.stringify({ notesText }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || 'failed')
      const flashcards = data.flashcards ?? []
      const cardCount = flashcards.length
      saveFlashcardsContent(itemId, flashcards).catch(e => console.warn('[telegram] saveFlashcards failed:', e.message))
      log[log.length - 1] = `🃏 <b>Flashcards</b> ✅ <code>${data.provider ?? 'unknown'}</code> · ${cardCount} cards · ${elapsed(t)}`
      await update()
    } catch (e: any) {
      log[log.length - 1] = formatProviderError('🃏 <b>Flashcards</b>', e.message) + ' (skipped)'
      await update()
    }
  }

  // ── DONE ───────────────────────────────────────────────────────────
  log.push('\n✅ <b>All done!</b>')
  await editMessage(chatId, msgId, log.join('\n'), [
    [btn('👁️ View Notes', `view_n:${sid(itemId)}`), btn('← Back to Note', `nav_i:${itemId}`)],
  ])
}

// ═══════════════════════════════════════════════════════════════════════
// VIEW CONTENT
// ═══════════════════════════════════════════════════════════════════════

async function handleViewNotes(chatId: number, itemId: string) {
  const item = await getItem(itemId)
  const html = await getNoteContent(itemId)
  if (!html) {
    await sendMessage(chatId, '📝 No notes found for this item. Generate AI notes first.', [
      // act_ai:{8}     = 15 bytes ✓
      // view_menu:{8}  = 18 bytes ✓
      [btn('🤖 Generate AI', `act_ai:${sid(itemId)}`), btn('← Back', `view_menu:${sid(itemId)}`)],
    ])
    return
  }
  const plain = stripTags(html)
  await sendMessage(chatId, `📝 <b>${item?.title ?? 'Notes'}</b>\n\n${truncate(plain)}`, [
    // view_menu:{8} = 18 bytes ✓
    [btn('← Back', `view_menu:${sid(itemId)}`)],
  ])
}

async function handleViewQuiz(chatId: number, itemId: string) {
  const item = await getItem(itemId)

  // ── 1. Try DB first ───────────────────────────────────────────────
  const saved = await getQuizFromDb(itemId)
  if (saved && saved.length > 0) {
    const lines = saved.map((q, i) => {
      const opts = q.options.map(o => `  ${o.letter}) ${o.text}`).join('\n')
      return `<b>Q${i + 1}.</b> ${q.questionText}\n${opts}\n✅ <b>${q.correctAnswer}</b>${q.explanation ? `\n💡 ${q.explanation}` : ''}`
    })
    const half = Math.ceil(lines.length / 2)
    await sendMessage(
      chatId,
      `❓ <b>Quiz</b> — ${item?.title ?? ''}\n<i>Saved · ${saved.length} questions</i>\n\n${truncate(lines.slice(0, half).join('\n\n'))}`
    )
    if (lines.length > half) {
      await sendMessage(chatId, truncate(lines.slice(half).join('\n\n')), [
        [btn('← Back', `view_menu:${sid(itemId)}`)],
      ])
    } else {
      await sendMessage(chatId, '— end of quiz —', [[btn('← Back', `view_menu:${sid(itemId)}`)]])
    }
    return
  }

  // ── 2. No saved quiz — need notes to generate ─────────────────────
  const html = await getNoteContent(itemId)
  if (!html) {
    await sendMessage(chatId, '❌ No notes or saved quiz found. Generate AI content first.', [
      [btn('🤖 Generate AI', `act_ai:${sid(itemId)}`), btn('← Back', `view_menu:${sid(itemId)}`)],
    ])
    return
  }

  const notesText = stripTags(html)
  const genMsg = await sendMessage(chatId, '❓ No saved quiz found — generating on demand…')
  const genMsgId = genMsg?.result?.message_id

  try {
    const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
    const res = await fetch(`${baseUrl}/api/ai-quiz`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': process.env.ADMIN_API_SECRET ?? '',
      },
      body: JSON.stringify({ notesText }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error || 'Quiz generation failed')
    if (!data.quiz) throw new Error('Quiz response missing quiz field')

    const quiz = data.quiz as string
    saveQuizContent(itemId, quiz).catch(e => console.warn('[telegram] saveQuiz (view) failed:', e.message))

    const questions = quiz.split(/(?=Q\d+\.)/).filter(Boolean)
    const half = Math.ceil(questions.length / 2)

    await editMessage(chatId, genMsgId, `❓ <b>Quiz</b> (${item?.title ?? ''})\n<code>Model: ${data.provider}</code>\n\n${truncate(questions.slice(0, half).join('\n'))}`)
    if (questions.length > half) {
      await sendMessage(chatId, truncate(questions.slice(half).join('\n')), [
        [btn('← Back', `view_menu:${sid(itemId)}`)],
      ])
    } else {
      await sendMessage(chatId, '— end of quiz —', [[btn('← Back', `view_menu:${sid(itemId)}`)]])
    }
  } catch (e: any) {
    await editMessage(chatId, genMsgId, `❌ Quiz generation failed: ${e.message}`, [
      [btn('🤖 Retry via Generate AI', `act_ai:${sid(itemId)}`), btn('← Back', `view_menu:${sid(itemId)}`)],
    ])
  }
}

async function handleViewFlashcards(chatId: number, itemId: string) {
  const item = await getItem(itemId)

  // ── 1. Try DB first ───────────────────────────────────────────────
  const saved = await getFlashcardsFromDb(itemId)
  if (saved && saved.length > 0) {
    const cardText = saved.map((c, i) =>
      `<b>Card ${i + 1}</b>\n🔵 <b>Q:</b> ${c.front}\n🟢 <b>A:</b> ${c.back}`
    ).join('\n\n')
    await sendMessage(
      chatId,
      `🃏 <b>Flashcards</b> — ${item?.title ?? ''}\n<i>Saved · ${saved.length} cards</i>\n\n${truncate(cardText)}`,
      [[btn('← Back', `view_menu:${sid(itemId)}`)]]
    )
    return
  }

  // ── 2. No saved flashcards — need notes to generate ───────────────
  const html = await getNoteContent(itemId)
  if (!html) {
    await sendMessage(chatId, '❌ No notes or saved flashcards found. Generate AI content first.', [
      [btn('🤖 Generate AI', `act_ai:${sid(itemId)}`), btn('← Back', `view_menu:${sid(itemId)}`)],
    ])
    return
  }

  const notesText = stripTags(html)
  const genMsg = await sendMessage(chatId, '🃏 No saved flashcards — generating on demand…')
  const genMsgId = genMsg?.result?.message_id

  try {
    const baseUrl = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000')
    const res = await fetch(`${baseUrl}/api/ai-flashcards`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': process.env.ADMIN_API_SECRET ?? '',
      },
      body: JSON.stringify({ notesText }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error || 'Flashcard generation failed')

    const cards: { front: string; back: string }[] = data.flashcards ?? []
    saveFlashcardsContent(itemId, cards).catch(e => console.warn('[telegram] saveFlashcards (view) failed:', e.message))

    const cardText = cards.map((c, i) =>
      `<b>Card ${i + 1}</b>\n🔵 <b>Q:</b> ${c.front}\n🟢 <b>A:</b> ${c.back}`
    ).join('\n\n')

    await editMessage(chatId, genMsgId, `🃏 <b>Flashcards</b> (${item?.title ?? ''})\n<code>Model: ${data.provider}</code>\n\n${truncate(cardText)}`, [
      [btn('← Back', `view_menu:${sid(itemId)}`)],
    ])
  } catch (e: any) {
    await editMessage(chatId, genMsgId, `❌ Flashcard generation failed: ${e.message}`, [
      [btn('🤖 Retry via Generate AI', `act_ai:${sid(itemId)}`), btn('← Back', `view_menu:${sid(itemId)}`)],
    ])
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PDF UPLOAD HANDLER
// ═══════════════════════════════════════════════════════════════════════

async function handlePdfUpload(chatId: number, fileId: string, fileName: string) {
  const session = await getSession(chatId)
  if (session.state !== 'awaiting_pdf') {
    await sendMessage(chatId, '⚠️ Not expecting a PDF right now. Navigate to a note and tap "Upload PDF" first.')
    return
  }
  // itemId stored in session is always the full UUID (set via setSession)
  const itemId = session.data.itemId as string
  await clearSession(chatId)

  const item = await getItem(itemId)
  if (!item) { await sendMessage(chatId, '❌ Note not found.'); return }

  const processingMsg = await sendMessage(chatId, `⏳ Uploading <b>${fileName}</b>…`)
  const processingMsgId = processingMsg?.result?.message_id

  try {
    // Download file from Telegram
    const filePath = await getTelegramFilePath(fileId)
    const fileBuffer = await downloadTelegramFile(filePath)

    // Upload to Backblaze B2
    const safeName = fileName.replace(/\s+/g, '-')
    const objectKey = `${itemId}/${safeName}`
    await b2Client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: objectKey,
      Body: fileBuffer,
      ContentType: 'application/pdf',
    }))

    // Save to DB
    await updateItemPdfUrl(itemId, objectKey)

    await editMessage(chatId, processingMsgId, `✅ <b>PDF uploaded</b> for <i>${item.title}</i>\n\nFile: <code>${safeName}</code>`, [
      // act_ai:{8} = 15 bytes ✓   nav_i:{8} = 14 bytes ✓
      [btn('🤖 Generate AI Now', `act_ai:${sid(itemId)}`), btn('← Back to Note', `nav_i:${sid(itemId)}`)],
    ])
  } catch (e: any) {
    await editMessage(chatId, processingMsgId, `❌ Upload failed: ${e.message}`, [
      // nav_i:{8} = 14 bytes ✓
      [btn('← Back', `nav_i:${sid(itemId)}`)],
    ])
  }
}

async function getTelegramFilePath(fileId: string): Promise<string> {
  const res = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`)
  const data = await res.json()
  if (!data.ok) throw new Error('Could not get file path from Telegram')
  return data.result.file_path
}

async function downloadTelegramFile(filePath: string): Promise<Buffer> {
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not download file: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

// ═══════════════════════════════════════════════════════════════════════
// NATURAL LANGUAGE NAVIGATION  (Groq / llama-3.3-70b-versatile)
// ═══════════════════════════════════════════════════════════════════════

type AIAction =
  | { action: 'navigate_course'; courseId: string }
  | { action: 'navigate_folder'; folderId: string; courseId: string }
  | { action: 'navigate_note'; itemId: string }
  | { action: 'upload_pdf'; itemId: string }
  | { action: 'generate_ai'; itemId: string }
  | { action: 'view_notes'; itemId: string }
  | { action: 'view_quiz'; itemId: string }
  | { action: 'view_flashcards'; itemId: string }
  | { action: 'create_course' }
  | { action: 'create_module'; courseId: string; parentId: string }
  | { action: 'create_note'; courseId: string; parentId: string }
  | { action: 'ambiguous'; matches: { name: string; id: string; type: 'course' | 'folder' | 'note' }[]; question: string }
  | { action: 'unknown'; message: string }

/**
 * Serialise the course tree into a compact text block for the LLM prompt.
 * Format keeps token count low while giving enough context for matching.
 */
function buildCourseStructureText(structure: Awaited<ReturnType<typeof getCourseStructure>>): string {
  const lines: string[] = []

  function writeItems(
    items: { id: string; title: string; item_type: string; children?: any[] }[],
    indent: number
  ) {
    const pad = '  '.repeat(indent)
    for (const item of items) {
      if (item.item_type === 'folder') {
        lines.push(`${pad}[FOLDER] "${item.title}" id=${item.id}`)
        if (item.children?.length) writeItems(item.children, indent + 1)
      } else {
        lines.push(`${pad}[NOTE] "${item.title}" id=${item.id}`)
      }
    }
  }

  for (const course of structure) {
    lines.push(`[COURSE] "${course.name}" id=${course.id}`)
    writeItems(course.folders, 1)
  }

  return lines.join('\n')
}

// ── LLM helpers for natural language (NVIDIA → Groq → OpenRouter) ─────

async function callNvidiaNav(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'moonshotai/kimi-k2.5',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      temperature: 0, max_tokens: 512,
    }),
  })
  if (!res.ok) throw new Error(`NVIDIA ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

async function callGroqNav(systemPrompt: string, userMessage: string, apiKey: string): Promise<string> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      temperature: 0, max_tokens: 512,
    }),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

async function callOpenRouterNav(systemPrompt: string, userMessage: string): Promise<string> {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL ?? '',
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMessage }],
      temperature: 0, max_tokens: 512,
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

async function callNavLLM(systemPrompt: string, userMessage: string): Promise<string> {
  const errors: string[] = []

  if (process.env.NVIDIA_API_KEY) {
    try { return await callNvidiaNav(systemPrompt, userMessage) } catch (e: any) { errors.push(`NVIDIA: ${e.message}`) }
  }
  if (process.env.GROQ_API_KEY) {
    try { return await callGroqNav(systemPrompt, userMessage, process.env.GROQ_API_KEY) } catch (e: any) { errors.push(`Groq: ${e.message}`) }
  }
  if (process.env.GROQ_API_KEY_2) {
    try { return await callGroqNav(systemPrompt, userMessage, process.env.GROQ_API_KEY_2) } catch (e: any) { errors.push(`Groq2: ${e.message}`) }
  }
  if (process.env.OPENROUTER_API_KEY) {
    try { return await callOpenRouterNav(systemPrompt, userMessage) } catch (e: any) { errors.push(`OpenRouter: ${e.message}`) }
  }

  throw new Error(`All AI providers failed: ${errors.join(' | ')}`)
}

async function handleNaturalLanguage(chatId: number, text: string) {
  // Show a thinking indicator so the user knows the bot is working
  const thinkMsg = await sendMessage(chatId, '🤔 Thinking…')
  const thinkMsgId = thinkMsg?.result?.message_id

  let structure: Awaited<ReturnType<typeof getCourseStructure>>
  try {
    structure = await getCourseStructure()
  } catch (e: any) {
    await editMessage(chatId, thinkMsgId, `❌ Could not load course structure: ${e.message}`)
    return
  }

  const structureText = buildCourseStructureText(structure)

  const systemPrompt = `You are a navigation assistant for Gavelogy, a legal education platform admin bot.
You are given the full course structure (courses, folders/modules, and notes) with their UUIDs.
The user will tell you what they want to do in plain English.
You must respond with ONLY a valid JSON object — no explanation, no markdown, no code block, just raw JSON.

The JSON must match exactly one of these shapes:
- Navigate to a course: {"action":"navigate_course","courseId":"<full-uuid>"}
- Navigate to a folder/module: {"action":"navigate_folder","folderId":"<full-uuid>","courseId":"<full-uuid>"}
- Navigate to a note: {"action":"navigate_note","itemId":"<full-uuid>"}
- Upload PDF for a note: {"action":"upload_pdf","itemId":"<full-uuid>"}
- Generate AI for a note: {"action":"generate_ai","itemId":"<full-uuid>"}
- View notes for a note: {"action":"view_notes","itemId":"<full-uuid>"}
- View quiz for a note: {"action":"view_quiz","itemId":"<full-uuid>"}
- View flashcards for a note: {"action":"view_flashcards","itemId":"<full-uuid>"}
- Create a new course: {"action":"create_course"}
- Create a new module: {"action":"create_module","courseId":"<full-uuid>","parentId":"<full-uuid-or-root>"}
- Create a new note: {"action":"create_note","courseId":"<full-uuid>","parentId":"<full-uuid-or-root>"}
- When multiple items match the user's intent (ambiguous): {"action":"ambiguous","matches":[{"name":"<display name>","id":"<full-uuid>","type":"course|folder|note"}],"question":"<ask the user which one>"}
- When you cannot understand or cannot find a match: {"action":"unknown","message":"<brief explanation>"}

Rules:
1. Use fuzzy/partial matching. "constitutional law" should match "Constitutional Law" or "Constitution Law".
2. If two or more items could match (similar names), return the "ambiguous" action with all matches (max 5).
3. For "create" requests, use "root" as parentId if no specific parent is mentioned.
4. The action keywords: "open", "go to", "navigate", "show" → navigate. "upload pdf", "add pdf" → upload_pdf. "generate ai", "create ai", "ai generate" → generate_ai. "view notes", "show notes" → view_notes. "create", "new", "add" → create_*.
5. Always return the FULL UUID from the course structure, not a truncated version.
6. If the user says "this note" or "current note" and no context is available, return unknown.

Course structure:
${structureText}`

  let rawJson = ''
  try {
    rawJson = await callNavLLM(systemPrompt, text)
  } catch (e: any) {
    await editMessage(chatId, thinkMsgId, `❌ AI service error: ${e.message}\n\nPlease use the menu buttons to navigate.`, [
      [btn('📚 Browse Courses', 'nav_courses')],
    ])
    return
  }

  // Parse the LLM response
  let aiAction: AIAction
  try {
    // Strip <think>...</think> blocks from reasoning models (kimi-k2.5, etc.)
    // then strip markdown code fences
    const stripped = rawJson.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
    const clean = stripped.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim()
    aiAction = JSON.parse(clean) as AIAction
  } catch {
    console.error('[NL] Failed to parse LLM response:', rawJson)
    await editMessage(chatId, thinkMsgId, `🤷 I couldn't understand that. Could you be more specific?\n\n<i>Tip: try "go to constitutional law course" or "upload pdf for rajeeb kalita note"</i>`, [
      [btn('📚 Browse Courses', 'nav_courses')],
    ])
    return
  }

  // Execute the action
  switch (aiAction.action) {

    case 'navigate_course': {
      await showCourse(chatId, aiAction.courseId, thinkMsgId)
      break
    }

    case 'navigate_folder': {
      await showFolder(chatId, aiAction.folderId, aiAction.courseId, thinkMsgId)
      break
    }

    case 'navigate_note': {
      await showNote(chatId, aiAction.itemId, thinkMsgId)
      break
    }

    case 'upload_pdf': {
      // Set session to awaiting_pdf, then prompt
      await setSession(chatId, 'awaiting_pdf', { itemId: aiAction.itemId })
      await editMessage(
        chatId,
        thinkMsgId,
        '📎 <b>Send the PDF file now.</b>\n\nJust send it as a document in this chat. The file will replace any existing judgment for this note.'
      )
      break
    }

    case 'generate_ai': {
      await editMessage(chatId, thinkMsgId, `🤖 Starting AI generation…`)
      await handleGenerateAi(chatId, aiAction.itemId)
      break
    }

    case 'view_notes': {
      await editMessage(chatId, thinkMsgId, `📝 Loading notes…`)
      await handleViewNotes(chatId, aiAction.itemId)
      break
    }

    case 'view_quiz': {
      await editMessage(chatId, thinkMsgId, `❓ Loading quiz…`)
      await handleViewQuiz(chatId, aiAction.itemId)
      break
    }

    case 'view_flashcards': {
      await editMessage(chatId, thinkMsgId, `🃏 Loading flashcards…`)
      await handleViewFlashcards(chatId, aiAction.itemId)
      break
    }

    case 'create_course': {
      await setSession(chatId, 'creating_course_name', {})
      await editMessage(chatId, thinkMsgId, '➕ <b>New Course</b>\n\nEnter the course name:')
      break
    }

    case 'create_module': {
      // Store full UUIDs in session (parentId may be 'root' or a full UUID)
      await setSession(chatId, 'creating_module_name', {
        courseId: aiAction.courseId,
        parentId: aiAction.parentId,
      })
      await editMessage(chatId, thinkMsgId, '📁 <b>New Module</b>\n\nEnter the module name:')
      break
    }

    case 'create_note': {
      await setSession(chatId, 'creating_note_title', {
        courseId: aiAction.courseId,
        parentId: aiAction.parentId,
      })
      await editMessage(chatId, thinkMsgId, '📄 <b>New Note</b>\n\nEnter the note title:')
      break
    }

    case 'ambiguous': {
      // Show disambiguation buttons using sid() to keep callback_data short
      // Buttons: nav_c:{8}, nav_f:{8}:{8} (need courseId - approximate with nav_i for notes/folders)
      const matches = (aiAction.matches ?? []).slice(0, 5)
      const kb = matches.map(m => {
        let callbackData: string
        if (m.type === 'course') {
          // nav_c:{8} = 14 bytes ✓
          callbackData = `nav_c:${sid(m.id)}`
        } else {
          // For folders and notes, we only have the item id — use nav_i which
          // will route to showNote (notes) or, for folders, we fall back to nav_i
          // which loads a folder/note generically. The LLM should provide courseId
          // in navigate_folder but here we have a simplified match object.
          // nav_i:{8} = 14 bytes ✓
          callbackData = `nav_i:${sid(m.id)}`
        }
        const emoji = m.type === 'course' ? '📚' : m.type === 'folder' ? '📁' : '📄'
        return [btn(`${emoji} ${m.name}`, callbackData)]
      })
      kb.push([btn('📚 Browse All Courses', 'nav_courses')])
      await editMessage(
        chatId,
        thinkMsgId,
        `🤔 <b>${aiAction.question ?? 'Which one did you mean?'}</b>`,
        kb
      )
      break
    }

    case 'unknown':
    default: {
      const msg = (aiAction as any).message ?? 'I could not understand that request.'
      await editMessage(
        chatId,
        thinkMsgId,
        `🤷 ${msg}\n\n<i>Tip: try "go to constitutional law course", "upload pdf for rajeeb kalita note", or "create a new module called tort law inside civil law course"</i>`,
        [
          [btn('📚 Browse Courses', 'nav_courses')],
        ]
      )
      break
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// WIZARD: TEXT INPUT HANDLER
// ═══════════════════════════════════════════════════════════════════════

async function handleTextInput(chatId: number, text: string) {
  const session = await getSession(chatId)

  switch (session.state) {

    // ── CREATE COURSE ──────────────────────────────────────────────
    case 'creating_course_name': {
      await setSession(chatId, 'creating_course_desc', { name: text.trim() })
      await sendMessage(chatId, `📝 Course name: <b>${text.trim()}</b>\n\nEnter a short description, or type <code>/skip</code> to skip:`)
      break
    }
    case 'creating_course_desc': {
      const desc = text.trim().toLowerCase() === '/skip' ? null : text.trim()
      await setSession(chatId, 'creating_course_price', { ...session.data, desc })
      await sendMessage(chatId, `Enter the price in ₹ (0 for free), or type <code>/skip</code> for free:`)
      break
    }
    case 'creating_course_price': {
      const raw = text.trim().toLowerCase()
      // Strip commas/spaces so "3,333" or "3 333" parses as 3333
      const price = raw === '/skip' ? 0 : parseInt(raw.replace(/[,\s]/g, ''), 10) || 0
      const { name, desc } = session.data
      await clearSession(chatId)
      try {
        const courseId = await createCourse(name, desc ?? null, price)
        await sendMessage(chatId, `✅ <b>Course created!</b>\n\n📚 ${name}\n💰 ₹${price}`, [
          // nav_c:{8} = 14 bytes ✓
          [btn('📁 Open Course', `nav_c:${sid(courseId)}`)],
          [btn('← All Courses', 'nav_courses')],
        ])
      } catch (e: any) {
        await sendMessage(chatId, `❌ Failed to create course: ${e.message}`)
      }
      break
    }

    // ── CREATE MODULE ──────────────────────────────────────────────
    case 'creating_module_name': {
      const { courseId, parentId } = session.data
      await clearSession(chatId)
      try {
        const id = await createStructureItem({
          courseId,
          parentId: parentId === 'root' ? null : parentId,
          itemType: 'folder',
          title: text.trim(),
        })
        // Auto-navigate into the new module so user lands in the folder view
        await sendMessage(chatId, `✅ <b>Module "${text.trim()}" created!</b>`)
        await showFolder(chatId, id, courseId)
      } catch (e: any) {
        await sendMessage(chatId, `❌ Failed to create module: ${e.message}`)
      }
      break
    }

    // ── CREATE NOTE ────────────────────────────────────────────────
    case 'creating_note_title': {
      const { courseId, parentId } = session.data
      await clearSession(chatId)
      try {
        const id = await createStructureItem({
          courseId,
          parentId: parentId === 'root' ? null : parentId,
          itemType: 'file',
          title: text.trim(),
        })
        // Auto-navigate into the note so user sees Upload PDF / Generate AI directly
        await sendMessage(chatId, `✅ <b>Note "${text.trim()}" created!</b>`)
        await showNote(chatId, id)
      } catch (e: any) {
        await sendMessage(chatId, `❌ Failed to create note: ${e.message}`)
      }
      break
    }

    // ── IDLE: route free text through natural language AI ──────────
    // ── EDIT COURSE PRICE ─────────────────────────────────────────
    case 'editing_course_price': {
      const { courseId } = session.data
      await clearSession(chatId)
      const raw = text.trim()
      const price = raw === '/skip' ? null : parseInt(raw.replace(/[,\s]/g, ''), 10)
      if (price === null || isNaN(price) || price < 0) {
        await sendMessage(chatId, '❌ Invalid price. Enter a number like <code>3333</code> or <code>0</code> for free.')
        await setSession(chatId, 'editing_course_price', { courseId })
        return
      }
      try {
        await updateCoursePrice(courseId, price)
        await sendMessage(chatId, `✅ Price updated to ₹${price}`)
        await showCourseSettings(chatId, courseId)
      } catch (e: any) {
        await sendMessage(chatId, `❌ Failed to update price: ${e.message}`)
      }
      break
    }

    case 'idle':
    default:
      await handleNaturalLanguage(chatId, text)
      break
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CALLBACK QUERY HANDLER
// ═══════════════════════════════════════════════════════════════════════

async function handleCallback(chatId: number, callbackId: string, data: string, msgId: number | undefined) {
  answerCallback(callbackId) // fire-and-forget — clears spinner instantly without blocking
  try {
    await handleCallbackInner(chatId, data, msgId)
  } catch (e: any) {
    console.error('[callback] Error:', data, e)
    await sendMessage(chatId, `❌ Error: ${e.message}\n\n<code>${data}</code>`, [[btn('🏠 Home', 'nav_home')]])
  }
}

async function handleCallbackInner(chatId: number, data: string, msgId: number | undefined) {

  // nav_courses
  if (data === 'nav_courses') { await showCourses(chatId, msgId); return }

  // nav_c:{shortCourseId}
  if (data.startsWith('nav_c:')) {
    const courseId = await expandId('courses', data.slice(6))
    await showCourse(chatId, courseId, msgId); return
  }

  // nav_f:{shortFolderId}:{shortCourseId}
  if (data.startsWith('nav_f:')) {
    const parts = data.split(':')
    // parts = ['nav_f', shortFolder, shortCourse]
    const shortFolder = parts[1]
    const shortCourse = parts[2]
    const [folderId, courseId] = await Promise.all([
      expandId('structure_items', shortFolder),
      expandId('courses', shortCourse),
    ])
    await showFolder(chatId, folderId, courseId, msgId); return
  }

  // nav_i:{shortItemId}
  if (data.startsWith('nav_i:')) {
    const itemId = await expandId('structure_items', data.slice(6))
    await showNote(chatId, itemId, msgId); return
  }

  // new_course
  if (data === 'new_course') {
    await setSession(chatId, 'creating_course_name', {})
    await editMessage(chatId, msgId, '➕ <b>New Course</b>\n\nEnter the course name:')
    return
  }

  // new_mod:{shortCourseId}:{shortParentId|root}
  if (data.startsWith('new_mod:')) {
    const parts = data.split(':')
    const shortCourse = parts[1]
    const shortParent = parts[2]
    const courseId = await expandId('courses', shortCourse)
    const parentId = shortParent === 'root' ? 'root' : await expandId('structure_items', shortParent)
    // Store full UUIDs in session so wizard handlers can use them directly
    await setSession(chatId, 'creating_module_name', { courseId, parentId })
    await editMessage(chatId, msgId, '📁 <b>New Module</b>\n\nEnter the module name:')
    return
  }

  // new_note:{shortCourseId}:{shortParentId|root}
  if (data.startsWith('new_note:')) {
    const parts = data.split(':')
    const shortCourse = parts[1]
    const shortParent = parts[2]
    const courseId = await expandId('courses', shortCourse)
    const parentId = shortParent === 'root' ? 'root' : await expandId('structure_items', shortParent)
    // Store full UUIDs in session so wizard handlers can use them directly
    await setSession(chatId, 'creating_note_title', { courseId, parentId })
    await editMessage(chatId, msgId, '📄 <b>New Note</b>\n\nEnter the note title:')
    return
  }

  // act_upload:{shortItemId}
  if (data.startsWith('act_upload:')) {
    const itemId = await expandId('structure_items', data.slice(11))
    // Store full UUID in session for handlePdfUpload
    await setSession(chatId, 'awaiting_pdf', { itemId })
    await editMessage(chatId, msgId, '📎 <b>Send the PDF file now.</b>\n\nJust send it as a document in this chat. The file will replace any existing judgment for this note.')
    return
  }

  // act_ai:{shortItemId}
  if (data.startsWith('act_ai:')) {
    const itemId = await expandId('structure_items', data.slice(7))
    await handleGenerateAi(chatId, itemId); return
  }

  // ai_yn:y:{shortItemId} — yes overwrite current item
  // ai_yn:n:{shortItemId} — no keep current item
  if (data.startsWith('ai_yn:')) {
    const overwrite = data[6] === 'y'
    const session = await getSession(chatId)
    if (session.state !== 'ai_confirm') return

    const sData = session.data as {
      itemId: string; pending: string[]
      skipNotes: boolean; skipQuiz: boolean; skipCards: boolean
    }
    const current = sData.pending[0]

    // Record the answer
    if (current === 'notes') sData.skipNotes = !overwrite
    if (current === 'quiz')  sData.skipQuiz  = !overwrite
    if (current === 'cards') sData.skipCards = !overwrite

    // Advance queue
    sData.pending = sData.pending.slice(1)
    await setSession(chatId, 'ai_confirm', sData)

    // Ask next or fire generation
    await askNextAiConfirm(chatId)
    return
  }

  // view_menu:{shortItemId}
  if (data.startsWith('view_menu:')) {
    const itemId = await expandId('structure_items', data.slice(10))
    await showViewMenu(chatId, itemId, msgId); return
  }

  // view_n:{shortItemId}
  if (data.startsWith('view_n:')) {
    const itemId = await expandId('structure_items', data.slice(7))
    await handleViewNotes(chatId, itemId); return
  }

  // view_q:{shortItemId}
  if (data.startsWith('view_q:')) {
    const itemId = await expandId('structure_items', data.slice(7))
    await handleViewQuiz(chatId, itemId); return
  }

  // view_f:{shortItemId}
  if (data.startsWith('view_f:')) {
    const itemId = await expandId('structure_items', data.slice(7))
    await handleViewFlashcards(chatId, itemId); return
  }

  // mode_notes:{shortItemId} — switch to notes mode view (just re-shows note, mode is auto from pdf_url)
  if (data.startsWith('mode_notes:')) {
    const itemId = await expandId('structure_items', data.slice(11))
    await showNote(chatId, itemId, msgId); return
  }

  // course_set:{shortCourseId} — open course settings
  if (data.startsWith('course_set:')) {
    const courseId = await expandId('courses', data.slice(11))
    await showCourseSettings(chatId, courseId, msgId); return
  }

  // toggle_pub:{shortCourseId} — publish/unpublish
  if (data.startsWith('toggle_pub:')) {
    const courseId = await expandId('courses', data.slice(11))
    await toggleCourseActive(courseId)
    await showCourseSettings(chatId, courseId, msgId)
    return
  }

  // edit_price:{shortCourseId} — start price edit wizard
  if (data.startsWith('edit_price:')) {
    const courseId = await expandId('courses', data.slice(11))
    await setSession(chatId, 'editing_course_price', { courseId })
    await editMessage(chatId, msgId, '💰 Enter the new price in ₹ (e.g. <code>3333</code>) or <code>0</code> for free:')
    return
  }

  // nav_home — back to welcome
  if (data === 'nav_home') { await showWelcome(chatId); return }

  // sc_pick:mod|note|gen|upload — pick a course for slash command flow
  if (data.startsWith('sc_pick:')) {
    const action = data.slice(8) as 'gen' | 'upload' | 'mod' | 'note'
    await showPickCourseFor(chatId, action)
    return
  }

  // sc_pick_c:{action}:{shortCourseId} — course chosen, now show items or start wizard
  if (data.startsWith('sc_pick_c:')) {
    const parts = data.split(':')
    const action = parts[1] as 'gen' | 'upload' | 'mod' | 'note'
    const courseId = await expandId('courses', parts[2])
    if (action === 'mod') {
      await setSession(chatId, 'creating_module_name', { courseId, parentId: 'root' })
      await editMessage(chatId, msgId, '📁 <b>New Module</b>\n\nEnter the module name:')
    } else if (action === 'note') {
      await setSession(chatId, 'creating_note_title', { courseId, parentId: 'root' })
      await editMessage(chatId, msgId, '📄 <b>New Note</b>\n\nEnter the note title:')
    } else {
      // gen or upload: show the course so user can pick a note
      await showCourse(chatId, courseId, msgId)
    }
    return
  }

  // sc_pub:{shortCourseId} — publish/unpublish course (from /publish command)
  if (data.startsWith('sc_pub:')) {
    const courseId = await expandId('courses', data.slice(7))
    await showCourseSettings(chatId, courseId, msgId)
    return
  }

  // sc_price:{shortCourseId} — edit price (from /price command)
  if (data.startsWith('sc_price:')) {
    const courseId = await expandId('courses', data.slice(9))
    await setSession(chatId, 'editing_course_price', { courseId })
    await editMessage(chatId, msgId, '💰 Enter the new price in ₹ (e.g. <code>3333</code>) or <code>0</code> for free:')
    return
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN WEBHOOK HANDLER
// ═══════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  // Security §6: Verify Telegram webhook secret token to prevent fake messages
  // Set TELEGRAM_WEBHOOK_SECRET in .env.local and register it with Telegram via /api/telegram/setup
  const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (webhookSecret) {
    const receivedToken = req.headers.get('x-telegram-bot-api-secret-token')
    if (receivedToken !== webhookSecret) {
      console.warn('[telegram/webhook] Invalid secret token — possible spoofed request')
      return NextResponse.json({ ok: true })  // Return 200 to Telegram but ignore the message
    }
  }

  try {
    const body = await req.json()

    // ── Callback query (button tap) ───────────────────────────────
    if (body.callback_query) {
      const cq = body.callback_query
      const chatId: number = cq.message?.chat?.id
      if (!isAdmin(chatId)) return NextResponse.json({ ok: true })
      // Return immediately so Telegram doesn't retry; process in background
      const res = NextResponse.json({ ok: true })
      handleCallback(chatId, cq.id, cq.data ?? '', cq.message?.message_id).catch(console.error)
      return res
    }

    // ── Regular message ───────────────────────────────────────────
    if (body.message) {
      const msg = body.message
      const chatId: number = msg.chat?.id
      if (!isAdmin(chatId)) return NextResponse.json({ ok: true })

      // PDF document upload
      if (msg.document) {
        const doc = msg.document
        const res = NextResponse.json({ ok: true })
        if (doc.mime_type === 'application/pdf') {
          handlePdfUpload(chatId, doc.file_id, doc.file_name ?? 'judgment.pdf').catch(console.error)
        } else {
          sendMessage(chatId, '⚠️ Please send a PDF file only.').catch(console.error)
        }
        return res
      }

      const text: string = msg.text ?? ''

      // Commands — fire and forget so Telegram doesn't retry on slow commands
      if (text.startsWith('/')) {
        const cmd = text.split(' ')[0].toLowerCase().split('@')[0]
        ;(async () => {
          clearSession(chatId) // no await — cache is updated instantly, DB write is async
          switch (cmd) {
            case '/start':    await showWelcome(chatId); break
            case '/help':     await showHelp(chatId); break
            case '/courses':  await showCourses(chatId); break
            case '/new':      await showNewMenu(chatId); break
            case '/newcourse':
              await setSession(chatId, 'creating_course_name', {})
              await sendMessage(chatId, '➕ <b>New Course</b>\n\nEnter the course name:')
              break
            case '/newmodule': await showPickCourseFor(chatId, 'mod'); break
            case '/newnote':   await showPickCourseFor(chatId, 'note'); break
            case '/generate':  await showPickCourseFor(chatId, 'gen'); break
            case '/upload':    await showPickCourseFor(chatId, 'upload'); break
            case '/publish': {
              const courses = await getCourses()
              if (courses.length === 0) {
                await sendMessage(chatId, '📚 No courses yet.')
              } else {
                await sendMessage(chatId, '📢 <b>Publish / Hide — Pick a course:</b>',
                  rows(courses.map(c => btn(`${c.icon ?? '📚'} ${c.name}`, `sc_pub:${sid(c.id)}`)), 1))
              }
              break
            }
            case '/price': {
              const courses = await getCourses()
              if (courses.length === 0) {
                await sendMessage(chatId, '📚 No courses yet.')
              } else {
                await sendMessage(chatId, '💰 <b>Change Price — Pick a course:</b>',
                  rows(courses.map(c => btn(`${c.icon ?? '📚'} ${c.name}`, `sc_price:${sid(c.id)}`)), 1))
              }
              break
            }
            case '/status': await showStatus(chatId); break
            case '/me':     await showMe(chatId); break
            default:        await showHelp(chatId); break
          }
        })().catch(console.error)
        return NextResponse.json({ ok: true })
      }

      // Free text — fire and forget so Telegram doesn't retry
      handleTextInput(chatId, text).catch(console.error)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[telegram/webhook] Error:', err)
    return NextResponse.json({ ok: true }) // Always 200 to Telegram
  }
}
