import { NextRequest, NextResponse } from 'next/server'
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { b2Client, BUCKET } from '@/lib/b2-client'
import {
  sendMessage, editMessage, answerCallback,
  getSession, setSession, clearSession,
  getCourses, getTopLevelFolders, getFolderChildren,
  getItem, getNoteContent, saveNoteContent, updateItemPdfUrl,
  createCourse, createStructureItem,
  stripTags, truncate, btn, rows, sid, expandId,
  extractPdfText,
} from '@/lib/telegram'

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
    msgId ? await editMessage(chatId, msgId, text, kb) : await sendMessage(chatId, text, kb)
    return
  }
  const text = '📚 <b>Select a Course</b>'
  const kb: ReturnType<typeof btn>[][] = [
    // nav_c:{8} = 6 + 8 = 14 bytes ✓
    ...rows(courses.map(c => btn(`${c.icon ?? '📚'} ${c.name}`, `nav_c:${sid(c.id)}`)), 1),
    [btn('➕ New Course', 'new_course')],
  ]
  msgId ? await editMessage(chatId, msgId, text, kb) : await sendMessage(chatId, text, kb)
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
    // nav_f:{8}:{8} = 6 + 8 + 1 + 8 = 23 bytes ✓
    // nav_i:{8}     = 6 + 8         = 14 bytes ✓
    ...rows(all.map(i => btn(`${itemEmoji(i.item_type)} ${i.title}`,
      i.item_type === 'folder' ? `nav_f:${sid(i.id)}:${sid(courseId)}` : `nav_i:${sid(i.id)}`
    )), 1),
    // new_mod:{8}:root = 8 + 8 + 1 + 4 = 21 bytes ✓
    // new_note:{8}:root= 9 + 8 + 1 + 4 = 22 bytes ✓
    [btn('📁 New Module', `new_mod:${sid(courseId)}:root`), btn('📄 New Note', `new_note:${sid(courseId)}:root`)],
    [btn('← Back to Courses', 'nav_courses')],
  ]
  msgId ? await editMessage(chatId, msgId, text, kb) : await sendMessage(chatId, text, kb)
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
  msgId ? await editMessage(chatId, msgId, text, kb) : await sendMessage(chatId, text, kb)
}

async function showNote(chatId: number, itemId: string, msgId?: number) {
  const item = await getItem(itemId)
  if (!item) { await sendMessage(chatId, '❌ Note not found.'); return }

  const hasPdf = !!item.pdf_url
  const text = `📄 <b>${item.title}</b>\n\n${hasPdf ? '✅ Judgment PDF attached' : '⚠️ No judgment PDF yet'}`

  const kb: ReturnType<typeof btn>[][] = [
    // act_upload:{8}   = 11 + 8 = 19 bytes ✓
    [btn(hasPdf ? '🔄 Replace PDF' : '📄 Upload PDF', `act_upload:${sid(itemId)}`)],
    // act_ai:{8}       = 7  + 8 = 15 bytes ✓
    [btn('🤖 Generate AI (Notes+Quiz+Flashcards)', `act_ai:${sid(itemId)}`)],
    // view_menu:{8}    = 10 + 8 = 18 bytes ✓
    [btn('👁️ View Content', `view_menu:${sid(itemId)}`)],
    // nav_f:{8}:{8} = 23 bytes ✓  or  nav_c:{8} = 14 bytes ✓
    [btn('← Back', item.parent_id ? `nav_f:${sid(item.parent_id)}:${sid(item.course_id)}` : `nav_c:${sid(item.course_id)}`)],
  ]
  msgId ? await editMessage(chatId, msgId, text, kb) : await sendMessage(chatId, text, kb)
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
  msgId ? await editMessage(chatId, msgId, text, kb) : await sendMessage(chatId, text, kb)
}

// ═══════════════════════════════════════════════════════════════════════
// AI GENERATION
// ═══════════════════════════════════════════════════════════════════════

async function handleGenerateAi(chatId: number, itemId: string) {
  const item = await getItem(itemId)
  if (!item) { await sendMessage(chatId, '❌ Note not found.'); return }
  if (!item.pdf_url) {
    await sendMessage(chatId, '❌ No judgment PDF attached to this note.\nUpload a PDF first, then try again.', [
      // nav_i:{8} = 14 bytes ✓
      [btn('← Back to Note', `nav_i:${sid(itemId)}`)],
    ])
    return
  }

  const progressMsg = await sendMessage(chatId, `⏳ Fetching PDF for <b>${item.title}</b>…`)
  const progressMsgId = progressMsg?.result?.message_id

  // 1. Get signed URL and download PDF
  let pdfBuffer: Buffer
  try {
    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: item.pdf_url })
    const signedUrl = await getSignedUrl(b2Client, cmd, { expiresIn: 300 })
    const res = await fetch(signedUrl)
    if (!res.ok) throw new Error(`Failed to download PDF: ${res.status}`)
    pdfBuffer = Buffer.from(await res.arrayBuffer())
  } catch (e: any) {
    await editMessage(chatId, progressMsgId, `❌ Could not fetch PDF: ${e.message}\n\nPlease generate from the admin panel instead.`, [
      [btn('← Back', `nav_i:${sid(itemId)}`)],
    ])
    return
  }

  // 2. Extract text with pdf-parse (Vercel-safe via extractPdfText helper)
  let pdfText: string
  try {
    if (progressMsgId) await editMessage(chatId, progressMsgId, '📄 Extracting PDF text…')
    pdfText = await extractPdfText(pdfBuffer)
  } catch (e: any) {
    await editMessage(chatId, progressMsgId, `❌ Could not extract PDF text: ${e.message}\n\nThe PDF may be scanned/image-based. Please generate from the admin panel.`, [
      [btn('← Back', `nav_i:${sid(itemId)}`)],
    ])
    return
  }

  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

  // 3. Generate Notes
  if (progressMsgId) await editMessage(chatId, progressMsgId, '📝 Generating notes… (this may take 15–30s)')
  let notesText = ''
  let notesProvider = 'unknown'
  try {
    const res = await fetch(`${baseUrl}/api/ai-summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pdfText }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error || 'Notes generation failed')
    await saveNoteContent(itemId, data.formatted)
    notesText = stripTags(data.formatted)
    notesProvider = data.provider ?? 'unknown'
  } catch (e: any) {
    await editMessage(chatId, progressMsgId, `❌ Notes generation failed: ${e.message}`, [
      [btn('← Back', `nav_i:${sid(itemId)}`)],
    ])
    return
  }

  // 4. Generate Quiz
  if (progressMsgId) await editMessage(chatId, progressMsgId, '❓ Generating quiz…')
  let quizCount = 0
  let quizProvider = 'unknown'
  try {
    const res = await fetch(`${baseUrl}/api/ai-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notesText }),
    })
    const data = await res.json()
    if (res.ok && data.quiz) {
      const matches = data.quiz.match(/^Q\d+\./gm)
      quizCount = matches?.length ?? 10
      quizProvider = data.provider ?? 'unknown'
    }
  } catch { /* non-fatal */ }

  // 5. Generate Flashcards
  if (progressMsgId) await editMessage(chatId, progressMsgId, '🃏 Generating flashcards…')
  let cardCount = 0
  let flashProvider = 'unknown'
  try {
    const res = await fetch(`${baseUrl}/api/ai-flashcards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notesText }),
    })
    const data = await res.json()
    if (res.ok && data.flashcards) {
      cardCount = data.flashcards.length
      flashProvider = data.provider ?? 'unknown'
    }
  } catch { /* non-fatal */ }

  // 6. Done
  const summary = [
    `✅ <b>AI Generation Complete</b> — <i>${item.title}</i>`,
    '',
    `📝 <b>Notes</b> saved  •  Model: <code>${notesProvider}</code>`,
    `❓ <b>Quiz</b>: ${quizCount} questions  •  Model: <code>${quizProvider}</code>`,
    `🃏 <b>Flashcards</b>: ${cardCount} cards  •  Model: <code>${flashProvider}</code>`,
  ].join('\n')

  await editMessage(chatId, progressMsgId, summary, [
    // view_n:{8} = 15 bytes ✓   nav_i:{8} = 14 bytes ✓
    [btn('👁️ View Notes', `view_n:${sid(itemId)}`), btn('← Back to Note', `nav_i:${sid(itemId)}`)],
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
  const html = await getNoteContent(itemId)
  if (!html) {
    await sendMessage(chatId, '❌ No notes found. Generate AI notes first.', [
      // act_ai:{8} = 15 bytes ✓
      [btn('🤖 Generate AI', `act_ai:${sid(itemId)}`)],
    ])
    return
  }
  const notesText = stripTags(html)
  const genMsg = await sendMessage(chatId, '❓ Generating quiz on demand…')
  const genMsgId = genMsg?.result?.message_id

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/ai-quiz`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notesText }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error || 'Quiz generation failed')

    const quiz = data.quiz as string
    // Show Q1–Q5 in first message, Q6–Q10 in second (character limit)
    const questions = quiz.split(/(?=Q\d+\.)/).filter(Boolean)
    const half = Math.ceil(questions.length / 2)

    await editMessage(chatId, genMsgId, `❓ <b>Quiz</b> (${item?.title ?? ''})\n<code>Model: ${data.provider}</code>\n\n${truncate(questions.slice(0, half).join('\n'))}`)
    if (questions.length > half) {
      await sendMessage(chatId, truncate(questions.slice(half).join('\n')), [
        // view_menu:{8} = 18 bytes ✓
        [btn('← Back', `view_menu:${sid(itemId)}`)],
      ])
    } else {
      await sendMessage(chatId, '— end of quiz —', [
        // view_menu:{8} = 18 bytes ✓
        [btn('← Back', `view_menu:${sid(itemId)}`)],
      ])
    }
  } catch (e: any) {
    await editMessage(chatId, genMsgId, `❌ Quiz generation failed: ${e.message}`, [
      // view_menu:{8} = 18 bytes ✓
      [btn('← Back', `view_menu:${sid(itemId)}`)],
    ])
  }
}

async function handleViewFlashcards(chatId: number, itemId: string) {
  const item = await getItem(itemId)
  const html = await getNoteContent(itemId)
  if (!html) {
    await sendMessage(chatId, '❌ No notes found. Generate AI notes first.', [
      // act_ai:{8} = 15 bytes ✓
      [btn('🤖 Generate AI', `act_ai:${sid(itemId)}`)],
    ])
    return
  }
  const notesText = stripTags(html)
  const genMsg = await sendMessage(chatId, '🃏 Generating flashcards on demand…')
  const genMsgId = genMsg?.result?.message_id

  try {
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/ai-flashcards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notesText }),
    })
    const data = await res.json()
    if (!res.ok || data.error) throw new Error(data.error || 'Flashcard generation failed')

    const cards: { front: string; back: string }[] = data.flashcards ?? []
    const cardText = cards.map((c, i) =>
      `<b>Card ${i + 1}</b>\n🔵 <b>Q:</b> ${c.front}\n🟢 <b>A:</b> ${c.back}`
    ).join('\n\n')

    await editMessage(chatId, genMsgId, `🃏 <b>Flashcards</b> (${item?.title ?? ''})\n<code>Model: ${data.provider}</code>\n\n${truncate(cardText)}`, [
      // view_menu:{8} = 18 bytes ✓
      [btn('← Back', `view_menu:${sid(itemId)}`)],
    ])
  } catch (e: any) {
    await editMessage(chatId, genMsgId, `❌ Flashcard generation failed: ${e.message}`, [
      // view_menu:{8} = 18 bytes ✓
      [btn('← Back', `view_menu:${sid(itemId)}`)],
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
      const price = raw === '/skip' ? 0 : parseInt(raw, 10) || 0
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
        await sendMessage(chatId, `✅ <b>Module created!</b>\n\n📁 ${text.trim()}`, [
          // nav_f:{8}:{8} = 23 bytes ✓
          [btn('📂 Open Module', `nav_f:${sid(id)}:${sid(courseId)}`)],
          // nav_c:{8} or nav_f:{8}:{8} ✓
          [btn('← Back', parentId === 'root' ? `nav_c:${sid(courseId)}` : `nav_f:${sid(parentId)}:${sid(courseId)}`)],
        ])
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
        await sendMessage(chatId, `✅ <b>Note created!</b>\n\n📄 ${text.trim()}`, [
          // nav_i:{8} = 14 bytes ✓
          [btn('📄 Open Note', `nav_i:${sid(id)}`)],
          // nav_c:{8} or nav_f:{8}:{8} ✓
          [btn('← Back', parentId === 'root' ? `nav_c:${sid(courseId)}` : `nav_f:${sid(parentId)}:${sid(courseId)}`)],
        ])
      } catch (e: any) {
        await sendMessage(chatId, `❌ Failed to create note: ${e.message}`)
      }
      break
    }

    default:
      await sendMessage(chatId, 'Use the buttons to navigate, or type /start to begin.', [
        [btn('📚 Browse Courses', 'nav_courses')],
      ])
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CALLBACK QUERY HANDLER
// ═══════════════════════════════════════════════════════════════════════

async function handleCallback(chatId: number, callbackId: string, data: string, msgId: number) {
  await answerCallback(callbackId)

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
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN WEBHOOK HANDLER
// ═══════════════════════════════════════════════════════════════════════

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // ── Callback query (button tap) ───────────────────────────────
    if (body.callback_query) {
      const cq = body.callback_query
      const chatId: number = cq.message?.chat?.id
      if (!isAdmin(chatId)) return NextResponse.json({ ok: true })
      await handleCallback(chatId, cq.id, cq.data ?? '', cq.message?.message_id)
      return NextResponse.json({ ok: true })
    }

    // ── Regular message ───────────────────────────────────────────
    if (body.message) {
      const msg = body.message
      const chatId: number = msg.chat?.id
      if (!isAdmin(chatId)) return NextResponse.json({ ok: true })

      // PDF document upload
      if (msg.document) {
        const doc = msg.document
        if (doc.mime_type === 'application/pdf') {
          await handlePdfUpload(chatId, doc.file_id, doc.file_name ?? 'judgment.pdf')
        } else {
          await sendMessage(chatId, '⚠️ Please send a PDF file only.')
        }
        return NextResponse.json({ ok: true })
      }

      const text: string = msg.text ?? ''

      // Commands
      if (text.startsWith('/')) {
        const cmd = text.split(' ')[0].toLowerCase()
        await clearSession(chatId)
        if (cmd === '/start' || cmd === '/help') { await showWelcome(chatId); return NextResponse.json({ ok: true }) }
        if (cmd === '/courses') { await showCourses(chatId); return NextResponse.json({ ok: true }) }
        await showWelcome(chatId)
        return NextResponse.json({ ok: true })
      }

      // Free text — feed to active wizard
      await handleTextInput(chatId, text)
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[telegram/webhook] Error:', err)
    return NextResponse.json({ ok: true }) // Always 200 to Telegram
  }
}
