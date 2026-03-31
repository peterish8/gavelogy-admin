/**
 * Gavelogy MCP Server — Streamable HTTP transport
 *
 * Tools (36 total):
 *
 * COURSES:
 *   list_courses          → list all courses
 *   create_course         → create a new top-level course
 *   update_course         → update course name/icon/description
 *   delete_course         → delete a course and all its items
 *   reorder_courses       → set order_index for multiple courses
 *
 * ITEMS:
 *   list_items            → list structure_items for a course
 *   search_items          → search items by title keyword
 *   get_item_details      → full metadata for one structure item
 *   create_item           → create a new file or folder item in a course
 *   rename_item           → rename an existing item by id
 *   delete_item           → delete an item and all its associated data
 *   move_item             → move an item to a different parent or course
 *   duplicate_item        → copy an item (optionally with its note)
 *   bulk_delete_items     → delete multiple items at once
 *   reorder_items         → set order_index for multiple items
 *
 * PDF:
 *   attach_pdf            → set/replace the PDF judgment on an item
 *   detach_pdf            → remove the PDF from an item
 *   get_judgment_text     → extract + return full PDF text server-side
 *
 * NOTES:
 *   get_note              → fetch note content for an item
 *   save_note             → save/overwrite note content
 *   get_note_summary      → plain-text preview of a note (no tags)
 *
 * QUIZZES:
 *   list_quizzes          → list all quizzes
 *   create_quiz           → create a new blank quiz for an item
 *   save_quiz             → save/overwrite questions for a quiz
 *   delete_quiz           → delete a quiz and all its questions
 *
 * FLASHCARDS:
 *   list_flashcards       → get flashcards JSON for an item
 *   save_flashcards       → save flashcards JSON for an item
 *   delete_flashcards     → clear all flashcards for an item
 *
 * PYQ:
 *   list_pyq_tests        → list all PYQ mock tests
 *   get_pyq_questions     → get all questions for a PYQ test
 *   create_pyq_test       → create a new PYQ mock test
 *   save_pyq_questions    → save/replace all questions for a PYQ test
 *   delete_pyq_test       → delete a PYQ test and its questions
 *   publish_pyq_test      → publish or unpublish a PYQ test
 *
 * USERS:
 *   list_users            → list all registered users
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { b2Client, BUCKET } from '@/lib/b2-client'

// Allow up to 60s for PDF download + parse on Vercel (avoids cold-start timeouts)
export const maxDuration = 60

// ─── PDF in-memory cache ───────────────────────────────────────────────────────
// Prevents re-downloading + re-parsing the same PDF within the same function instance.
// Keyed by item_id. Limited to 10 entries to bound memory usage.
// NOTE: Vercel serverless instances are ephemeral — this cache is per-instance only.
// Persistent caching is done via the pdf_text_cache column in structure_items.
const _pdfCache = new Map<string, string>()
const PDF_CACHE_MAX = 10

// ─── Auth ─────────────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.MCP_SECRET_KEY
  if (!secret) {
    // Fail-safe: if secret is missing from env, deny ALL requests.
    // An MCP server with full DB write access must never be open by default.
    console.error('[MCP] MCP_SECRET_KEY env var is not set — denying request. Set it in .env.local and Vercel.')
    return false
  }
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
Gavelogy uses a CUSTOM BRACKET-TAG FORMAT. Use ONLY these tags — no raw HTML.

━━ AVAILABLE TAGS ━━
[h1]Title[/h1]           — Case title
[h2]Title[/h2]           — Section headings
[h3]Title[/h3]           — Sub-headings
[p]Text[/p]              — ALL body text (wrap every sentence)
[b]text[/b]              — Bold: article/section numbers, party names, key terms
[i]text[/i]              — Italic: Latin phrases, obiter labels
[hl:#7EC8B8]text[/hl]    — TEAL: ratio/holdings ("The Court held that...")
[hl:#D4A96A]text[/hl]    — GOLD: key legal terms, doctrine names, constitutional concepts
[hl:#9EC4D8]text[/hl]    — SKY: every case name + citation
[hl:#C4A8E0]text[/hl]    — LAVENDER: obiter dicta, secondary observations
[hl:#F0A0A0]text[/hl]    — ROSE: overruled cases, exam warnings
[box:blue]...[/box]      — Blue box: identity/citation block, context
[box:green]...[/box]     — Green box: memory aid / mnemonic
[box:red]...[/box]       — Red box: core ratio / critical holding
[box:yellow]...[/box]    — Yellow box: exam probability insight, cautions
[box:purple]...[/box]    — Purple box: statutes/provisions block
[box:violet]...[/box]    — Violet box: court's reasoning (constitutional cases)
[ul][li]item[/li][/ul]   — Bullet list
[ol][li]item[/li][/ul]   — Numbered list
[hr]                     — Section divider

━━ NOTE STRUCTURE (13 sections — always follow this order) ━━

SECTION 1 — CASE DETAILS
[h1]📌 [Case Name][/h1]
[box:blue]
[p][b]📜 Citation:[/b] [hl:#9EC4D8][citation][/hl][/p]
[p][b]⚖️ Bench:[/b] [judges] ([X]-judge bench)[/p]
[p][b]📅 Date:[/b] [DD-MM-YYYY][/p]
[p][b]📚 Subject Area:[/b] ...[/p]
[p][b]🧠 Sub-topic:[/b] ...[/p]
[/box]
[box:purple]
[p][b]📜 Constitutional Provisions:[/b][/p][ul][li]...[/li][/ul]
[p][b]📜 Statutory Provisions:[/b][/p][ul][li]...[/li][/ul]
[/box]

SECTION 2 — CASE CAPSULE ⭐ (one-line: issue + decision, 20–25 words)
[h2]📍 Case Capsule[/h2][box:red][p][hl:#7EC8B8]...[/hl][/p][/box]

SECTION 3 — TIMELINE (ONLY if multi-stage / long delay / constitutional process — SKIP otherwise)
[h2]⏳ Timeline[/h2][ul][li][Year] — [Event][/li][/ul]  (max 3–5 points)

SECTION 4 — FACTS (max 3 sentences, 25 words each; constitutional cases may have 4–5)
[h2]🧾 Facts[/h2]
[p]1️⃣ [Parties + dispute][/p]
[p]2️⃣ [Legal controversy][/p]
[p]3️⃣ [Trigger][/p]

SECTION 5 — LEGAL ISSUES (all issues the court framed, as "Whether...?" questions)
[h2]📊 Legal Issues[/h2]
[ol][li]📊 [b]Issue 1:[/b] [hl:#D4A96A]Whether … ?[/hl][/li][/ol]

SECTION 6 — HOLDINGS / RATIO DECIDENDI ⭐
[h2]⭐ Holdings / Ratio Decidendi[/h2]
[box:red][p][b]⚖️ H1 [RATIO ⭐ CORE]:[/b] [hl:#7EC8B8]The Court held that ...[/hl][/p][/box]
[p][b]⚖️ H2 [RATIO]:[/b] [hl:#7EC8B8]The Court held that ...[/hl][/p]
[p][b]❗ O1 [OBITER]:[/b] [hl:#C4A8E0]The Court observed that ...[/hl][/p]
(If directions/orders given:)
[h3]📋 Directions / Orders[/h3][ul][li]...[/li][/ul]

SECTION 7 — DOCTRINES / PRINCIPLES
[h2]🧠 Doctrines / Principles[/h2]
[p]🧠 [b][hl:#D4A96A][Doctrine Name][/hl][/b][/p]
[p]📌 [Meaning in this case][/p]
[p]📊 Status: Applied / Reaffirmed / Established / Overruled[/p]
[p]📜 Prior Case: [hl:#9EC4D8][Case (Year)][/hl][/p]

SECTION 8 — STATUTORY / CONSTITUTIONAL INTERPRETATION
[h2]📜 Statutory / Constitutional Interpretation[/h2]
[p]📜 [b]Primary Provision:[/b] [hl:#D4A96A][Article/Section][/hl][/p]
[p]🔍 [b]Interpretation:[/b] ...[/p]
[p]📜 [b]Secondary Provisions:[/b] [hl:#D4A96A]...[/hl][/p]

SECTION 9 — CASE REFERENCE MATRIX ⭐
[h2]🧩 Case Reference Matrix[/h2]
[ul]
[li]🧩 [b]RELIED UPON:[/b] [hl:#9EC4D8][Case (Year)][/hl] — [principle][/li]
[li]🧩 [b]REFERRED TO:[/b] [hl:#9EC4D8][Case (Year)][/hl] — [principle][/li]
[li]🧩 [b]DISTINGUISHED:[/b] [hl:#9EC4D8][Case (Year)][/hl] — [distinction][/li]
[li]🧩 [b]OVERRULED:[/b] [hl:#F0A0A0][Case (Year)][/hl] — [reason][/li]
[/ul]
(If none in a category → write "None". [VERIFY] if citation uncertain.)

SECTION 10 — COURT'S ANALYSIS ⭐
[h2]🔍 Court's Analysis[/h2]
For CONSTITUTIONAL cases (5+ bench / fundamental rights):
[h3]🔍 Issue 1: Whether … ?[/h3][box:violet][p]Majority: ...[/p][p]Concurring: ...[/p][p]Dissent: [hl:#F0A0A0]...[/hl][/p][/box]

For NON-CONSTITUTIONAL cases:
[p]🔍 [b]Legal Context:[/b] ...[/p]
[p]🔍 [b]Interpretation:[/b] ...[/p]
[p]🔍 [b]Application:[/b] ...[/p]
[p]🔍 [b]Balancing:[/b] ...[/p]
[p]🔍 [b]Final Logic:[/b] ...[/p]

SECTION 11 — MEMORY AID (ONLY if genuinely powerful — SKIP if forced)
[h2]🧩 Memory Aid[/h2][box:green][p][b]🧩 [Short phrase / acronym, max 10 words][/b][/p][/box]

SECTION 12 — CONCLUSION (50–70 words: core principle + legal importance + CLAT PG relevance)
[h2]📌 Conclusion[/h2][p]...[/p]

SECTION 13 — EXAM PROBABILITY INSIGHT ⭐
[h2]📊 Exam Probability Insight[/h2]
[box:yellow][ul]
[li]⭐ [b]Exam probability:[/b] [0–100]% — [brief reason][/li]
[li]📌 [b]Why it matters:[/b] ...[/li]
[li]⚖️ [b]Key examinable point:[/b] ...[/li]
[/ul][/box]

━━ ABSOLUTE RULES ━━
- NEVER invent citations, judges, or doctrines → use [VERIFY] if uncertain
- "we observe" / "in passing" / "it would appear" = obiter (❗), NEVER ratio (⚖️)
- NEVER nest [hl:] inside another [hl:]
- NEVER wrap status words (Applied, Overruled, etc.) in [hl:] tags
- Wrap ALL body text in [p][/p]
- For criminal cases: list BOTH old IPC/CrPC AND new BNS/BNSS/BSA section
- Include Timeline ONLY if genuinely useful; Memory Aid ONLY if genuinely powerful`

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
    name: 'create_course',
    description: 'Create a new top-level course in Gavelogy. Returns the new course id and details.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Course name (e.g. "Case Laws 2025")' },
        icon: { type: 'string', description: 'Optional emoji icon for the course (e.g. "⚖️")' },
        description: { type: 'string', description: 'Optional description of the course' },
      },
      required: ['name'],
    },
  },
  {
    name: 'create_item',
    description: 'Create a new structure item (file or folder) inside a course. Pass parent_id to nest under a folder, or omit it for a top-level item. Returns the new item id.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'UUID of the course this item belongs to' },
        title: { type: 'string', description: 'Title of the new item (e.g. "Gayatri Balasamy v. ISG Novasoft")' },
        item_type: { type: 'string', enum: ['file', 'folder'], description: '"file" for a case/chapter, "folder" for a section/module' },
        parent_id: { type: 'string', description: 'Optional UUID of the parent folder. Omit (or pass null) for a top-level item in the course.' },
        description: { type: 'string', description: 'Optional description for the item' },
      },
      required: ['course_id', 'title', 'item_type'],
    },
  },
  {
    name: 'rename_item',
    description: 'Rename an existing structure item (case, chapter, folder). Updates the title by item_id.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item to rename' },
        title: { type: 'string', description: 'New title for the item' },
      },
      required: ['item_id', 'title'],
    },
  },
  {
    name: 'delete_item',
    description: 'Delete a structure item and ALL its associated data (note, flashcards, quizzes, PDF links). This is irreversible. Always confirm the item_id is correct before calling.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item to delete' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'move_item',
    description: 'Move a structure item to a different parent folder or to the top level of a course. Pass new_parent_id=null to make it top-level. Optionally pass new_course_id for cross-course moves.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item to move' },
        new_parent_id: { type: ['string', 'null'], description: 'UUID of the new parent folder, or null to make this item top-level in the course' },
        new_course_id: { type: 'string', description: 'Optional: UUID of the target course (only needed for cross-course moves; defaults to the item\'s current course)' },
      },
      required: ['item_id', 'new_parent_id'],
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
2. If has_more is true, call again with page_from=next_page and page_to=next_page+99 (100-page chunks).
3. Keep looping until has_more is false. You will then have read the entire judgment.

DO NOT ask the user to do this manually — loop through all chunks automatically.

Example loop:
  chunk1 = get_judgment_text(item_id)          → pages 1-100, next_page=101
  chunk2 = get_judgment_text(item_id, 101, 200) → pages 101-200, has_more=false → done`,
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item' },
        page_from: { type: 'number', description: 'Start page (1-indexed, default: 1)' },
        page_to: { type: 'number', description: 'End page inclusive (default: 100). Use chunks of 100 pages.' },
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
    description: 'Get all questions for a PYQ test. Returns questions with option_a/b/c/d, correct_answer (A/B/C/D), explanation, and inline passage text.',
    inputSchema: {
      type: 'object',
      properties: {
        test_id: { type: 'string', description: 'UUID of the PYQ test' },
      },
      required: ['test_id'],
    },
  },
  {
    name: 'delete_course',
    description: 'Delete a course and ALL its structure items, notes, flashcards, quizzes, and PDF links. This is irreversible.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'UUID of the course to delete' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'update_course',
    description: 'Update a course name, icon, or description. Pass only the fields you want to change.',
    inputSchema: {
      type: 'object',
      properties: {
        course_id: { type: 'string', description: 'UUID of the course to update' },
        name: { type: 'string', description: 'New course name (optional)' },
        icon: { type: 'string', description: 'New emoji icon (optional, e.g. "⚖️")' },
        description: { type: 'string', description: 'New description (optional)' },
      },
      required: ['course_id'],
    },
  },
  {
    name: 'reorder_courses',
    description: 'Set the order_index of multiple courses at once. Pass an array of {id, order_index} pairs.',
    inputSchema: {
      type: 'object',
      properties: {
        courses: {
          type: 'array',
          description: 'Array of {id, order_index} pairs',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Course UUID' },
              order_index: { type: 'number', description: 'New order index (0-based)' },
            },
            required: ['id', 'order_index'],
          },
        },
      },
      required: ['courses'],
    },
  },
  {
    name: 'duplicate_item',
    description: 'Duplicate a structure item, placing the copy at the same level (same parent/course) with title suffixed " (copy)". Optionally copies the note content too.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the item to duplicate' },
        copy_note: { type: 'boolean', description: 'If true, also copy the note + flashcards to the new item (default: false)' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'bulk_delete_items',
    description: 'Delete multiple structure items at once. All associated notes, flashcards, quizzes, and PDF links are removed via FK cascade.',
    inputSchema: {
      type: 'object',
      properties: {
        item_ids: {
          type: 'array',
          description: 'Array of item UUIDs to delete',
          items: { type: 'string' },
        },
      },
      required: ['item_ids'],
    },
  },
  {
    name: 'reorder_items',
    description: 'Set the order_index of multiple structure items at once. Pass an array of {id, order_index} pairs.',
    inputSchema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          description: 'Array of {id, order_index} pairs',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Item UUID' },
              order_index: { type: 'number', description: 'New order index (0-based)' },
            },
            required: ['id', 'order_index'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'attach_pdf',
    description: 'Set or replace the PDF judgment on a structure item. Provide the B2 storage key (e.g. "judgments/filename.pdf"). Clears any existing pdf_text_cache so the next get_judgment_text call re-parses the new file.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item' },
        pdf_url: { type: 'string', description: 'B2 storage key for the PDF (e.g. "judgments/case-name.pdf")' },
      },
      required: ['item_id', 'pdf_url'],
    },
  },
  {
    name: 'detach_pdf',
    description: 'Remove the PDF judgment from a structure item and clear its text cache.',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'create_quiz',
    description: 'Create a new blank quiz attached to a structure item. Returns the new quiz id. Use save_quiz to add questions.',
    inputSchema: {
      type: 'object',
      properties: {
        note_item_id: { type: 'string', description: 'UUID of the structure item this quiz belongs to' },
        title: { type: 'string', description: 'Quiz title (e.g. "Criminal Law Quiz 1")' },
        passing_score: { type: 'number', description: 'Passing score percentage (e.g. 70). Default: 70' },
      },
      required: ['note_item_id', 'title'],
    },
  },
  {
    name: 'delete_quiz',
    description: 'Delete a quiz and all its questions. Use quiz_id from list_quizzes.',
    inputSchema: {
      type: 'object',
      properties: {
        quiz_id: { type: 'string', description: 'UUID of the quiz to delete' },
      },
      required: ['quiz_id'],
    },
  },
  {
    name: 'delete_flashcards',
    description: 'Delete all flashcards for a structure item (sets flashcards_json to null).',
    inputSchema: {
      type: 'object',
      properties: {
        item_id: { type: 'string', description: 'UUID of the structure item' },
      },
      required: ['item_id'],
    },
  },
  {
    name: 'create_pyq_test',
    description: 'Create a new PYQ (Previous Year Question) mock test. Returns the new test id. Use save_pyq_questions to add questions.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Test title (e.g. "CLAT 2023 Full Paper")' },
        exam_name: { type: 'string', description: 'Exam name (e.g. "CLAT PG")' },
        year: { type: 'number', description: 'Exam year (e.g. 2023)' },
        duration_minutes: { type: 'number', description: 'Duration in minutes (e.g. 120)' },
        total_marks: { type: 'number', description: 'Total marks (e.g. 120)' },
        negative_marking: { type: 'number', description: 'Negative marks per wrong answer (e.g. 0.25). Default: 0' },
      },
      required: ['title', 'exam_name', 'year'],
    },
  },
  {
    name: 'save_pyq_questions',
    description: 'Save/overwrite all questions for a PYQ test. Deletes existing questions and inserts the new ones.',
    inputSchema: {
      type: 'object',
      properties: {
        test_id: { type: 'string', description: 'UUID of the PYQ test' },
        questions: {
          type: 'array',
          description: 'Array of PYQ question objects',
          items: {
            type: 'object',
            properties: {
              question_text: { type: 'string', description: 'Question text' },
              option_a: { type: 'string', description: 'Option A' },
              option_b: { type: 'string', description: 'Option B' },
              option_c: { type: 'string', description: 'Option C' },
              option_d: { type: 'string', description: 'Option D' },
              correct_answer: { type: 'string', enum: ['A', 'B', 'C', 'D'], description: 'Correct answer letter' },
              explanation: { type: 'string', description: 'Explanation (optional)' },
              passage: { type: 'string', description: 'Passage text for reading-comprehension questions (optional)' },
              marks: { type: 'number', description: 'Marks for this question (default: 1)' },
            },
            required: ['question_text', 'option_a', 'option_b', 'option_c', 'option_d', 'correct_answer'],
          },
        },
      },
      required: ['test_id', 'questions'],
    },
  },
  {
    name: 'delete_pyq_test',
    description: 'Delete a PYQ test and all its questions. This is irreversible.',
    inputSchema: {
      type: 'object',
      properties: {
        test_id: { type: 'string', description: 'UUID of the PYQ test to delete' },
      },
      required: ['test_id'],
    },
  },
  {
    name: 'publish_pyq_test',
    description: 'Publish or unpublish a PYQ test (sets is_published true or false).',
    inputSchema: {
      type: 'object',
      properties: {
        test_id: { type: 'string', description: 'UUID of the PYQ test' },
        is_published: { type: 'boolean', description: 'true to publish, false to unpublish' },
      },
      required: ['test_id', 'is_published'],
    },
  },
  {
    name: 'list_users',
    description: 'List all registered users (id, email, created_at, last_sign_in_at). Useful for monitoring access.',
    inputSchema: { type: 'object', properties: {}, required: [] },
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

  // ── create_course ───────────────────────────────────────────────────────────
  if (name === 'create_course') {
    const { name: courseName, icon, description } = args
    if (!courseName) throw new Error('name is required')

    // Compute next order_index
    const { data: maxRow } = await db
      .from('courses')
      .select('order_index')
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextOrder = maxRow ? (maxRow.order_index ?? 0) + 1 : 0

    const { data, error } = await db
      .from('courses')
      .insert({ name: courseName, icon: icon || null, description: description || null, order_index: nextOrder, is_active: true })
      .select('id, name, icon, description, order_index')
      .single()
    if (error) throw new Error(error.message)
    return JSON.stringify(data, null, 2)
  }

  // ── create_item ─────────────────────────────────────────────────────────────
  if (name === 'create_item') {
    const { course_id, title, item_type, parent_id = null, description } = args
    if (!course_id) throw new Error('course_id is required')
    if (!title) throw new Error('title is required')
    if (!item_type || !['file', 'folder'].includes(item_type)) throw new Error('item_type must be "file" or "folder"')

    // Compute next order_index among siblings
    let siblingQuery = db
      .from('structure_items')
      .select('order_index')
      .eq('course_id', course_id)
      .order('order_index', { ascending: false })
      .limit(1)
    if (parent_id) {
      siblingQuery = siblingQuery.eq('parent_id', parent_id)
    } else {
      siblingQuery = siblingQuery.is('parent_id', null)
    }
    const { data: maxSibling } = await siblingQuery.maybeSingle()
    const nextOrder = maxSibling ? (maxSibling.order_index ?? 0) + 1 : 0

    const { data, error } = await db
      .from('structure_items')
      .insert({
        course_id,
        title,
        item_type,
        parent_id: parent_id || null,
        description: description || null,
        order_index: nextOrder,
        is_active: true,
      })
      .select('id, title, item_type, course_id, parent_id, order_index')
      .single()
    if (error) throw new Error(error.message)
    return JSON.stringify(data, null, 2)
  }

  // ── rename_item ─────────────────────────────────────────────────────────────
  if (name === 'rename_item') {
    const { item_id, title } = args
    if (!item_id) throw new Error('item_id is required')
    if (!title) throw new Error('title is required')

    // Fetch current title for feedback
    const { data: existing, error: fetchError } = await db
      .from('structure_items')
      .select('title')
      .eq('id', item_id)
      .single()
    if (fetchError) throw new Error(fetchError.message)
    if (!existing) throw new Error(`Item ${item_id} not found`)

    const { error } = await db
      .from('structure_items')
      .update({ title, updated_at: new Date().toISOString() })
      .eq('id', item_id)
    if (error) throw new Error(error.message)
    return `Renamed "${existing.title}" → "${title}" (id: ${item_id})`
  }

  // ── delete_item ─────────────────────────────────────────────────────────────
  if (name === 'delete_item') {
    const { item_id } = args
    if (!item_id) throw new Error('item_id is required')

    // Fetch item details for the confirmation message
    const { data: existing, error: fetchError } = await db
      .from('structure_items')
      .select('title, item_type')
      .eq('id', item_id)
      .single()
    if (fetchError) throw new Error(fetchError.message)
    if (!existing) throw new Error(`Item ${item_id} not found`)

    // FK cascades (add_fk_cascades.sql) handle note_contents, attached_quizzes,
    // note_pdf_links, and draft_content_cache automatically on delete.
    const { error } = await db
      .from('structure_items')
      .delete()
      .eq('id', item_id)
    if (error) throw new Error(error.message)
    return `Deleted item "${existing.title}" (${existing.item_type}, id: ${item_id}) and all associated notes, flashcards, quizzes, and PDF links.`
  }

  // ── move_item ────────────────────────────────────────────────────────────────
  if (name === 'move_item') {
    const { item_id, new_parent_id, new_course_id } = args
    if (!item_id) throw new Error('item_id is required')
    if (!('new_parent_id' in args)) throw new Error('new_parent_id is required (pass null for top-level)')

    // 1. Fetch item to get current course_id and title
    const { data: item, error: itemError } = await db
      .from('structure_items')
      .select('title, course_id, parent_id')
      .eq('id', item_id)
      .single()
    if (itemError) throw new Error(itemError.message)
    if (!item) throw new Error(`Item ${item_id} not found`)

    const targetCourseId = new_course_id || item.course_id
    const targetParentId = new_parent_id || null

    // 2. If targeting a specific parent folder, verify it exists in the target course
    if (targetParentId) {
      const { data: parentItem, error: parentError } = await db
        .from('structure_items')
        .select('id, item_type, course_id')
        .eq('id', targetParentId)
        .single()
      if (parentError) throw new Error(parentError.message)
      if (!parentItem) throw new Error(`Parent folder ${targetParentId} not found`)
      if (parentItem.item_type !== 'folder') throw new Error(`Target parent ${targetParentId} is not a folder`)
    }

    // 3. Compute new order_index among target siblings
    let sibQuery = db
      .from('structure_items')
      .select('order_index')
      .eq('course_id', targetCourseId)
      .order('order_index', { ascending: false })
      .limit(1)
    if (targetParentId) {
      sibQuery = sibQuery.eq('parent_id', targetParentId)
    } else {
      sibQuery = sibQuery.is('parent_id', null)
    }
    const { data: maxSib } = await sibQuery.maybeSingle()
    const nextOrder = maxSib ? (maxSib.order_index ?? 0) + 1 : 0

    // 4. Update item
    const { error } = await db
      .from('structure_items')
      .update({
        parent_id: targetParentId,
        course_id: targetCourseId,
        order_index: nextOrder,
        updated_at: new Date().toISOString(),
      })
      .eq('id', item_id)
    if (error) throw new Error(error.message)

    const fromDesc = item.parent_id ? `parent ${item.parent_id}` : 'top-level'
    const toDesc = targetParentId ? `folder ${targetParentId}` : 'top-level'
    return `Moved "${item.title}" from ${fromDesc} → ${toDesc} in course ${targetCourseId} (order_index: ${nextOrder})`
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
    const { item_id, page_from = 1, page_to = 100 } = args
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

    // 2. Get full PDF text — check caches in order:
    //    a) in-memory (same function instance, fastest)
    //    b) Supabase pdf_text_cache column (persists across cold starts)
    //    c) download + parse from B2 (slowest, populates both caches)
    let fullText: string

    if (_pdfCache.has(item_id)) {
      // In-memory hit — skip everything
      fullText = _pdfCache.get(item_id)!
    } else {
      // Check Supabase persistent cache first
      const { data: cachedRow } = await db
        .from('structure_items')
        .select('pdf_text_cache')
        .eq('id', item_id)
        .single()

      if ((cachedRow as any)?.pdf_text_cache) {
        fullText = (cachedRow as any).pdf_text_cache as string
      } else {
        // Cache miss — download from B2 and parse
        const command = new GetObjectCommand({ Bucket: BUCKET, Key: item.pdf_url })
        const signedUrl = await getSignedUrl(b2Client, command, { expiresIn: 300 })
        const res = await fetch(signedUrl)
        if (!res.ok) throw new Error(`Failed to fetch PDF from B2: ${res.status}`)
        const buffer = Buffer.from(await res.arrayBuffer())

        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse') as (buf: Buffer, opts?: any) => Promise<{ text: string; numpages: number }>
        const parsed = await pdfParse(buffer, { max: 0 })
        if (!parsed.text?.trim()) {
          throw new Error('No text extracted from PDF — the file may be scanned/image-based.')
        }

        fullText = parsed.text

        // Persist to Supabase so future cold-start instances skip re-parsing
        await db
          .from('structure_items')
          .update({ pdf_text_cache: fullText })
          .eq('id', item_id)
      }

      // Populate in-memory cache for subsequent calls in this instance
      if (_pdfCache.size >= PDF_CACHE_MAX) {
        const firstKey = _pdfCache.keys().next().value
        if (firstKey) _pdfCache.delete(firstKey)
      }
      _pdfCache.set(item_id, fullText)
    }
    // 3. Chunk by character position.
    //    CHUNK_SIZE is chosen so that a 54-page judgment (~180k chars) gives ~54 chunks
    //    matching PDF page numbers 1-1. page_from/page_to map to chunk indices.
    const totalChars = fullText.length
    // Aim for ~totalPages chunks so chunk numbers ≈ page numbers
    // We need totalPages — parse it from the cached text length or re-parse lightly.
    // For chunk sizing, use the cached fullText length-based heuristic.
    const totalPagesEst = Math.max(1, Math.ceil(totalChars / 3000))  // ~3000 chars/page heuristic
    const CHUNK_SIZE = Math.max(1000, Math.ceil(totalChars / totalPagesEst))
    const totalChunks = Math.ceil(totalChars / CHUNK_SIZE)

    const chunkFrom = Math.min(pageFrom, totalChunks)
    const chunkTo = Math.min(pageTo, totalChunks)

    const start = (chunkFrom - 1) * CHUNK_SIZE
    const end = chunkTo * CHUNK_SIZE
    const chunkText = fullText.slice(start, end).trim()

    if (!chunkText) {
      return `=== ${item.title} ===\nChunks ${chunkFrom}–${chunkTo} of ${totalChunks} (~${totalPagesEst} PDF pages est.) — no content in this range.\nhas_more: false — END OF DOCUMENT`
    }

    const hasMore = chunkTo < totalChunks
    const nextChunk = hasMore ? chunkTo + 1 : null

    const meta = [
      `=== ${item.title} ===`,
      `Pages: ${chunkFrom}–${chunkTo} of ~${totalPagesEst} (est.) | chars: ${start}–${Math.min(end, totalChars)}`,
      hasMore
        ? `has_more: true | next_page: ${nextChunk} | Call: get_judgment_text(item_id="${item_id}", page_from=${nextChunk}, page_to=${nextChunk! + 99})`
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
    // options must be stored as [{letter, text}] to match the QuizOption format the UI expects.
    // correct_answer must be a letter ('A','B','C','D'), not a number index.
    const LETTERS = ['A', 'B', 'C', 'D', 'E']
    const rows = questions.map((q: any, i: number) => ({
      quiz_id,
      question_text: q.question,
      options: (q.options as string[]).map((text: string, idx: number) => ({
        letter: LETTERS[idx] || String(idx + 1),
        text,
      })),
      correct_answer: LETTERS[Number(q.correct_index)] || String(q.correct_index),
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
  // pyq_questions has: id, test_id, order_index, question_text, option_a, option_b,
  //   option_c, option_d, correct_answer, explanation, passage, marks
  // There is NO pyq_passages table — passage text is stored inline on each question row.
  if (name === 'get_pyq_questions') {
    const { test_id } = args
    if (!test_id) throw new Error('test_id is required')
    const { data, error } = await db
      .from('pyq_questions')
      .select('id, order_index, question_text, option_a, option_b, option_c, option_d, correct_answer, explanation, passage, marks')
      .eq('test_id', test_id)
      .order('order_index')
    if (error) throw new Error(error.message)
    return JSON.stringify(data || [], null, 2)
  }

  // ── delete_course ────────────────────────────────────────────────────────────
  if (name === 'delete_course') {
    const { course_id } = args
    if (!course_id) throw new Error('course_id is required')

    const { data: course, error: fetchError } = await db
      .from('courses')
      .select('name')
      .eq('id', course_id)
      .single()
    if (fetchError) throw new Error(fetchError.message)
    if (!course) throw new Error(`Course ${course_id} not found`)

    // Delete all structure_items first — FK cascades clean up notes/quizzes/etc.
    await db.from('structure_items').delete().eq('course_id', course_id)

    const { error } = await db.from('courses').delete().eq('id', course_id)
    if (error) throw new Error(error.message)
    return `Deleted course "${(course as any).name}" (id: ${course_id}) and all its items, notes, flashcards, and quizzes.`
  }

  // ── update_course ────────────────────────────────────────────────────────────
  if (name === 'update_course') {
    const { course_id, name: courseName, icon, description } = args
    if (!course_id) throw new Error('course_id is required')

    const updates: Record<string, unknown> = {}
    if (courseName !== undefined) updates.name = courseName
    if (icon !== undefined) updates.icon = icon
    if (description !== undefined) updates.description = description
    if (Object.keys(updates).length === 0) throw new Error('Provide at least one of: name, icon, description')

    const { data, error } = await db
      .from('courses')
      .update(updates)
      .eq('id', course_id)
      .select('id, name, icon, description')
      .single()
    if (error) throw new Error(error.message)
    return JSON.stringify(data, null, 2)
  }

  // ── reorder_courses ───────────────────────────────────────────────────────────
  if (name === 'reorder_courses') {
    const { courses } = args
    if (!Array.isArray(courses) || courses.length === 0) throw new Error('courses must be a non-empty array')

    const results = await Promise.all(
      (courses as Array<{ id: string; order_index: number }>).map((c) =>
        db.from('courses').update({ order_index: c.order_index }).eq('id', c.id)
      )
    )
    const errors = results.filter((r) => r.error).map((r) => r.error!.message)
    if (errors.length) throw new Error(`Reorder errors: ${errors.join(', ')}`)
    return `Reordered ${courses.length} course(s).`
  }

  // ── duplicate_item ────────────────────────────────────────────────────────────
  if (name === 'duplicate_item') {
    const { item_id, copy_note = false } = args
    if (!item_id) throw new Error('item_id is required')

    const { data: original, error: fetchError } = await db
      .from('structure_items')
      .select('title, item_type, course_id, parent_id, description')
      .eq('id', item_id)
      .single()
    if (fetchError) throw new Error(fetchError.message)
    if (!original) throw new Error(`Item ${item_id} not found`)

    const orig = original as any

    // Compute next order_index among siblings
    let sibQuery = db
      .from('structure_items')
      .select('order_index')
      .eq('course_id', orig.course_id)
      .order('order_index', { ascending: false })
      .limit(1)
    if (orig.parent_id) {
      sibQuery = sibQuery.eq('parent_id', orig.parent_id)
    } else {
      sibQuery = sibQuery.is('parent_id', null)
    }
    const { data: maxSib } = await sibQuery.maybeSingle()
    const nextOrder = maxSib ? ((maxSib as any).order_index ?? 0) + 1 : 0

    const { data: newItem, error: insertError } = await db
      .from('structure_items')
      .insert({
        course_id: orig.course_id,
        title: `${orig.title} (copy)`,
        item_type: orig.item_type,
        parent_id: orig.parent_id || null,
        description: orig.description || null,
        order_index: nextOrder,
        is_active: true,
      })
      .select('id, title, item_type, course_id, parent_id, order_index')
      .single()
    if (insertError) throw new Error(insertError.message)

    if (copy_note) {
      const { data: noteData } = await db
        .from('note_contents')
        .select('content_html, flashcards_json')
        .eq('item_id', item_id)
        .maybeSingle()
      if (noteData) {
        await db.from('note_contents').insert({
          item_id: (newItem as any).id,
          content_html: (noteData as any).content_html,
          flashcards_json: (noteData as any).flashcards_json,
          updated_at: new Date().toISOString(),
        })
      }
    }

    return JSON.stringify(newItem, null, 2)
  }

  // ── bulk_delete_items ─────────────────────────────────────────────────────────
  if (name === 'bulk_delete_items') {
    const { item_ids } = args
    if (!Array.isArray(item_ids) || item_ids.length === 0) throw new Error('item_ids must be a non-empty array')

    const { error } = await db.from('structure_items').delete().in('id', item_ids as string[])
    if (error) throw new Error(error.message)
    return `Deleted ${item_ids.length} item(s) and all associated data.`
  }

  // ── reorder_items ─────────────────────────────────────────────────────────────
  if (name === 'reorder_items') {
    const { items } = args
    if (!Array.isArray(items) || items.length === 0) throw new Error('items must be a non-empty array')

    const results = await Promise.all(
      (items as Array<{ id: string; order_index: number }>).map((item) =>
        db.from('structure_items').update({ order_index: item.order_index }).eq('id', item.id)
      )
    )
    const errors = results.filter((r) => r.error).map((r) => r.error!.message)
    if (errors.length) throw new Error(`Reorder errors: ${errors.join(', ')}`)
    return `Reordered ${items.length} item(s).`
  }

  // ── attach_pdf ────────────────────────────────────────────────────────────────
  if (name === 'attach_pdf') {
    const { item_id, pdf_url } = args
    if (!item_id) throw new Error('item_id is required')
    if (!pdf_url) throw new Error('pdf_url is required')

    const { error } = await db
      .from('structure_items')
      .update({ pdf_url, pdf_text_cache: null, updated_at: new Date().toISOString() })
      .eq('id', item_id)
    if (error) throw new Error(error.message)
    _pdfCache.delete(item_id)
    return `Attached PDF "${pdf_url}" to item ${item_id}. Text cache cleared.`
  }

  // ── detach_pdf ────────────────────────────────────────────────────────────────
  if (name === 'detach_pdf') {
    const { item_id } = args
    if (!item_id) throw new Error('item_id is required')

    const { error } = await db
      .from('structure_items')
      .update({ pdf_url: null, pdf_text_cache: null, updated_at: new Date().toISOString() })
      .eq('id', item_id)
    if (error) throw new Error(error.message)
    _pdfCache.delete(item_id)
    return `Detached PDF from item ${item_id}.`
  }

  // ── create_quiz ───────────────────────────────────────────────────────────────
  if (name === 'create_quiz') {
    const { note_item_id, title, passing_score = 70 } = args
    if (!note_item_id) throw new Error('note_item_id is required')
    if (!title) throw new Error('title is required')

    const { data, error } = await db
      .from('attached_quizzes')
      .insert({ note_item_id, title, passing_score })
      .select('id, title, note_item_id, passing_score')
      .single()
    if (error) throw new Error(error.message)
    return JSON.stringify(data, null, 2)
  }

  // ── delete_quiz ───────────────────────────────────────────────────────────────
  if (name === 'delete_quiz') {
    const { quiz_id } = args
    if (!quiz_id) throw new Error('quiz_id is required')

    const { data: quiz, error: fetchError } = await db
      .from('attached_quizzes')
      .select('title')
      .eq('id', quiz_id)
      .single()
    if (fetchError) throw new Error(fetchError.message)
    if (!quiz) throw new Error(`Quiz ${quiz_id} not found`)

    await db.from('quiz_questions').delete().eq('quiz_id', quiz_id)
    const { error } = await db.from('attached_quizzes').delete().eq('id', quiz_id)
    if (error) throw new Error(error.message)
    return `Deleted quiz "${(quiz as any).title}" (id: ${quiz_id}) and all its questions.`
  }

  // ── delete_flashcards ─────────────────────────────────────────────────────────
  if (name === 'delete_flashcards') {
    const { item_id } = args
    if (!item_id) throw new Error('item_id is required')

    const { error } = await db
      .from('note_contents')
      .update({ flashcards_json: null, updated_at: new Date().toISOString() })
      .eq('item_id', item_id)
    if (error) throw new Error(error.message)
    return `Deleted all flashcards for item ${item_id}.`
  }

  // ── create_pyq_test ───────────────────────────────────────────────────────────
  if (name === 'create_pyq_test') {
    const { title, exam_name, year, duration_minutes, total_marks, negative_marking = 0 } = args
    if (!title) throw new Error('title is required')
    if (!exam_name) throw new Error('exam_name is required')
    if (!year) throw new Error('year is required')

    const { data, error } = await db
      .from('pyq_tests')
      .insert({
        title,
        exam_name,
        year,
        duration_minutes: duration_minutes || null,
        total_marks: total_marks || null,
        negative_marking,
        is_published: false,
      })
      .select('id, title, exam_name, year, duration_minutes, total_marks, negative_marking, is_published')
      .single()
    if (error) throw new Error(error.message)
    return JSON.stringify(data, null, 2)
  }

  // ── save_pyq_questions ────────────────────────────────────────────────────────
  if (name === 'save_pyq_questions') {
    const { test_id, questions } = args
    if (!test_id) throw new Error('test_id is required')
    if (!Array.isArray(questions)) throw new Error('questions must be an array')

    const { error: delError } = await db.from('pyq_questions').delete().eq('test_id', test_id)
    if (delError) throw new Error(`Failed to delete old questions: ${delError.message}`)

    const rows = (questions as any[]).map((q, i) => ({
      test_id,
      order_index: i,
      question_text: q.question_text,
      option_a: q.option_a,
      option_b: q.option_b,
      option_c: q.option_c,
      option_d: q.option_d,
      correct_answer: q.correct_answer,
      explanation: q.explanation || null,
      passage: q.passage || null,
      marks: q.marks ?? 1,
    }))
    const { error: insError } = await db.from('pyq_questions').insert(rows)
    if (insError) throw new Error(`Failed to insert questions: ${insError.message}`)
    return `Saved ${questions.length} question(s) to PYQ test ${test_id}.`
  }

  // ── delete_pyq_test ───────────────────────────────────────────────────────────
  if (name === 'delete_pyq_test') {
    const { test_id } = args
    if (!test_id) throw new Error('test_id is required')

    const { data: test, error: fetchError } = await db
      .from('pyq_tests')
      .select('title')
      .eq('id', test_id)
      .single()
    if (fetchError) throw new Error(fetchError.message)
    if (!test) throw new Error(`PYQ test ${test_id} not found`)

    await db.from('pyq_questions').delete().eq('test_id', test_id)
    const { error } = await db.from('pyq_tests').delete().eq('id', test_id)
    if (error) throw new Error(error.message)
    return `Deleted PYQ test "${(test as any).title}" (id: ${test_id}) and all its questions.`
  }

  // ── publish_pyq_test ──────────────────────────────────────────────────────────
  if (name === 'publish_pyq_test') {
    const { test_id, is_published } = args
    if (!test_id) throw new Error('test_id is required')
    if (typeof is_published !== 'boolean') throw new Error('is_published must be a boolean')

    const { error } = await db
      .from('pyq_tests')
      .update({ is_published })
      .eq('id', test_id)
    if (error) throw new Error(error.message)
    return `PYQ test ${test_id} is now ${is_published ? 'published' : 'unpublished'}.`
  }

  // ── list_users ────────────────────────────────────────────────────────────────
  if (name === 'list_users') {
    const { data: { users }, error } = await db.auth.admin.listUsers()
    if (error) throw new Error(error.message)
    const rows = users.map((u) => ({
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
    }))
    return JSON.stringify(rows, null, 2)
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
