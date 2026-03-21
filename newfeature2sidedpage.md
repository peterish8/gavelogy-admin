# Admin Coding Prompt — Notes + Judgment Mode (Admin Side)

Copy-paste this entire file into Cursor / Windsurf to build the admin tagging tool.

---

## WHAT THIS PROJECT IS

Gavalogy is a Next.js 15 (App Router) + Supabase + TypeScript + Tailwind CSS legal EdTech SaaS for CLAT PG students. Stack: React 19, pnpm, Zustand, pdfjs-dist 5.5.207.

---

## WHAT HAS ALREADY BEEN BUILT (DO NOT TOUCH OR REBUILD)

### Student-side (already working, leave alone):
- `/src/components/judgment/useVirtualPDF.ts` — hook that loads a PDF using pdfjs-dist v5. Key: uses `{ canvas, viewport }` (NOT `canvasContext`) for `page.render()`.
- `/src/components/judgment/JudgmentPanel.tsx` — PDF viewer panel for students. Virtualized with IntersectionObserver.
- `/src/components/judgment/NotesJudgmentLayout.tsx` — Split-panel layout wrapper. Wraps the existing notes page. Shows a toggle "Notes Only / Notes + Judgment". Fetches `note_pdf_links` from Supabase.
- `/src/components/judgment/HighlightOverlay.tsx` — Amber-gold pulsing highlight box rendered on top of a PDF page canvas.
- `/src/components/judgment/BezierConnector.tsx` — Full-viewport SVG bezier line connecting a note span to a PDF highlight box.
- `/src/actions/judgment/links.ts` — All Supabase queries:
  - `fetchLinksForItem(itemId)` — read links for a case
  - `checkItemHasPdf(itemId)` — returns pdf_url or null
  - `insertLink(payload)` — admin insert via service role
  - `deleteLink(id)` — admin delete via service role
  - `updateItemPdfUrl(itemId, pdfUrl)` — admin update pdf_url on structure_items
  - `fetchAllCaseItems()` — returns all structure_items where title matches CS-/CQ-/CR- pattern

### Admin skeleton (already created, needs proper implementation):
- `/src/lib/admin-auth.ts` — `isAdmin()` checks logged-in user's email against `NEXT_PUBLIC_ADMIN_EMAILS` env var (comma-separated).
- `/src/app/admin/layout.tsx` — Admin layout with sidebar. Calls `isAdmin()`, redirects non-admins to `/`. Has links to "Tag Cases" and "Back to App".
- `/src/app/admin/tag/page.tsx` — Case list page. Lists all structure_items (cases), shows PDF upload status, link count, Tag button. **Currently implemented but needs review/improvement.**
- `/src/app/admin/tag/[caseId]/page.tsx` — Main tagging workspace page. **Currently scaffolded.**
- `/src/app/admin/tag/[caseId]/TaggingCanvas.tsx` — Drag-select component for tagging PDF regions. **Currently scaffolded.**
- `/src/app/admin/tag/[caseId]/TagModal.tsx` — Modal to input link_id and label after drag. **Currently scaffolded.**

---

## DATABASE SCHEMA (TRUTH — from Supabase)

### `structure_items` table (this is what "cases" really are)
```
id          uuid  PK
title       text  NOT NULL   -- e.g. "CS-25-A-01", "CQ-24-05", "CR-23-03"
item_type   text  NOT NULL
course_id   uuid
parent_id   uuid  nullable
description text  nullable
icon        text  nullable
order_index integer
is_active   boolean default true
pdf_url     text  nullable   -- ADDED by migration: URL to judgment PDF
created_at  timestamptz
updated_at  timestamptz
```

### `note_pdf_links` table (NEW — created by migration)
```
id          uuid  PK  default gen_random_uuid()
item_id     uuid  FK → structure_items(id) ON DELETE CASCADE
link_id     text  NOT NULL   -- matches data-link-id on note span e.g. "link-ratio"
pdf_page    integer NOT NULL  -- 1-indexed
x           float NOT NULL    -- PDF user-space units (bottom-left origin)
y           float NOT NULL    -- PDF user-space units (from bottom of page)
width       float NOT NULL
height      float NOT NULL
label       text  nullable    -- e.g. "¶58 — Core Ratio"
created_at  timestamptz default now()
```

RLS: SELECT for all (students can read). INSERT/DELETE for service_role only (admin actions go through `insertLink` / `deleteLink` in `/src/actions/judgment/links.ts` which use the service role key).

### `note_contents` table
```
id           uuid PK
item_id      uuid FK → structure_items(id)
content_html text   -- custom tag format, converted via customToHtml() for display
search_vector tsvector
created_at   timestamptz
updated_at   timestamptz
```

### Supabase Storage
- Bucket: `judgments` (public)
- Path: `{structure_item_id}/{filename}.pdf`
- Public URL format: `https://<project>.supabase.co/storage/v1/object/public/judgments/{itemId}/{filename}.pdf`

---

## COORDINATE SYSTEM (CRITICAL — must be consistent)

PDF.js v5 uses a bottom-left origin for PDF coordinates. Screen uses top-left origin.

**PDF-space → screen-space (for rendering highlights):**
```ts
const SCALE = 1.3  // Must be the same everywhere
const screenX = link.x * SCALE
const screenY = canvas.height - (link.y + link.height) * SCALE
const screenW = link.width * SCALE
const screenH = link.height * SCALE
```

**Screen-space → PDF-space (for saving admin drag selections):**
```ts
const pageHeightPdf = canvas.height / SCALE  // canvas.height = pageHeightPdf * SCALE
const pdfX = mouseX / SCALE
const pdfH = mouseH / SCALE
const pdfY = pageHeightPdf - (mouseY / SCALE) - pdfH
const pdfW = mouseW / SCALE
```

---

## pdfjs-dist v5 USAGE (IMPORTANT — API changed from v4)

```ts
import * as pdfjsLib from 'pdfjs-dist'
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'  // file exists in /public/

const pdf = await pdfjsLib.getDocument(pdfUrl).promise
const page = await pdf.getPage(pageNum)  // 1-indexed
const viewport = page.getViewport({ scale: 1.3 })

// v5 uses `canvas` not `canvasContext`:
canvas.width = viewport.width
canvas.height = viewport.height
await page.render({ canvas, viewport }).promise  // ← pass canvas element, NOT canvas.getContext('2d')

// Text extraction for speech:
const textContent = await page.getTextContent()
const text = textContent.items.map((item: any) => item.str).join(' ')
```

---

## SUPABASE CLIENT

```ts
// Browser client (for reads):
import { supabase } from '@/lib/supabase-client'

// Admin client (for writes — uses service role key):
import { createClient } from '@supabase/supabase-js'
const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
```

Or just use the pre-built helpers in `/src/actions/judgment/links.ts` — `insertLink`, `deleteLink`, `updateItemPdfUrl` already use the service role client internally.

---

## ADMIN AUTH

```ts
import { isAdmin } from '@/lib/admin-auth'
const ok = await isAdmin()  // returns true if logged-in user's email is in NEXT_PUBLIC_ADMIN_EMAILS
```

The admin layout at `/src/app/admin/layout.tsx` already handles the redirect if not admin.

---

## EXISTING NOTE CONTENT FORMAT

Notes are stored in `note_contents.content_html` using a custom tag format. `customToHtml()` from `/src/lib/content-converter.ts` converts them to HTML for display.

A new tag `[link:link-id]text[/link]` was added — this renders as:
```html
<span class="linked-text" data-link-id="link-id">text</span>
```
These spans get dashed amber underlines and on click (in split mode) jump the PDF to the mapped region.

To parse existing link IDs from a case's note content (for the TagModal dropdown), search for `data-link-id="..."` patterns in the `content_html` string.

---

## WHAT YOU NEED TO BUILD (ADMIN SIDE)

The admin files have been scaffolded but need proper, complete implementation. Here is exactly what each file should do:

---

### `/src/app/admin/tag/page.tsx` — Case List

**Purpose:** Admin views all cases, uploads PDFs, navigates to tagging workspace.

**Layout:**
- Page title "Tag Cases" with subtitle
- Table/list of all structure_items where title matches case patterns (CS-, CQ-, CR-)
- Each row shows:
  - Case title (e.g. "CS-25-A-01")
  - PDF status: green "✓ PDF uploaded" or red "✗ No PDF"
  - Number of tagged links (e.g. "3 links")
  - "Upload PDF" button — file input, uploads to Supabase Storage bucket `judgments`, then calls `updateItemPdfUrl()`
  - "Tag →" button — only enabled if pdf_url exists, links to `/admin/tag/{caseId}`
- Use the dark amber-gold Gavalogy admin theme (bg `#0f0e0b`, amber accents)

**Data fetching:**
- Call `fetchAllCaseItems()` from `/src/actions/judgment/links.ts` for the case list
- Batch-fetch link counts from `note_pdf_links` grouped by `item_id`

---

### `/src/app/admin/tag/[caseId]/TaggingCanvas.tsx` — PDF + Drag Select

**Purpose:** Renders the full judgment PDF and lets admin drag-select rectangular regions on any page.

**Props:**
```ts
interface TaggingCanvasProps {
  pdfUrl: string
  existingLinks: NotePdfLink[]
  onRegionSelected: (region: { page: number; x: number; y: number; width: number; height: number }) => void
}
```

**Behaviour:**
1. Load PDF using `useVirtualPDF` hook from `/src/components/judgment/useVirtualPDF.ts`
2. Render all pages at `scale = 1.3` — use the same IntersectionObserver virtualisation (render when page enters viewport)
3. Each page has:
   - Canvas element (rendered by `renderPage()` from the hook)
   - Transparent interaction overlay div (`position: absolute, inset: 0, cursor: crosshair, z-index: 10`)
   - Existing link overlays: coloured semi-transparent boxes at correct coordinates for each existing link on that page
4. **Drag select on overlay:**
   - `mousedown` → record `startX, startY` relative to canvas container
   - `mousemove` → draw live dashed selection rectangle (`border: 2px dashed #c9922a, background: rgba(201,146,42,0.12)`)
   - `mouseup` → convert to PDF-space → call `onRegionSelected()`
5. Existing link overlays: amber tinted boxes. On hover, show tooltip with `link_id` and `label`.
6. Each page clearly labelled "Page N" above it.

**Coordinate conversion (screen → PDF):**
```ts
const canvas = canvasRefs.get(pageNum)
const pageHeightPdf = canvas.height / SCALE
const pdfX = mouseX / SCALE
const pdfH = mouseH / SCALE
const pdfY = pageHeightPdf - (mouseY / SCALE) - pdfH
const pdfW = mouseW / SCALE
```

---

### `/src/app/admin/tag/[caseId]/TagModal.tsx` — Save Region Modal

**Purpose:** After admin drags a region, this modal appears asking for `link_id` and `label`.

**Props:**
```ts
interface TagModalProps {
  region: { page: number; x: number; y: number; width: number; height: number }
  existingLinkIds: string[]          // already tagged link IDs for this case (prevent duplicates)
  noteContentLinkIds: string[]       // link IDs found in note content (data-link-id attributes) for dropdown suggestions
  onSave: (linkId: string, label: string) => Promise<void>
  onClose: () => void
}
```

**UI:**
- Overlay modal (fixed, centered, dark backdrop)
- Shows region info: "Page N · (x, y) · WxH PDF units"
- `link_id` input — text field. Below it, show chips for `noteContentLinkIds` — clicking a chip fills the input. Show warning if value already exists in `existingLinkIds`.
- `label` input — optional, placeholder "e.g. ¶58 — Core Ratio"
- Save / Cancel buttons
- On Save: validate `link_id` not empty and not duplicate → call `onSave(linkId, label)`

---

### `/src/app/admin/tag/[caseId]/page.tsx` — Tagging Workspace

**Purpose:** Full workspace for tagging a single case's PDF.

**Layout (two-column, full height):**
```
┌─────────────────────────────────┬──────────────────┐
│  ← Back   CS-25-A-01            │  Mappings (3)    │
├─────────────────────────────────┤                  │
│                                 │  [link-ratio]    │
│   PDF Canvas pages              │  Page 12         │
│   (TaggingCanvas)               │  [trash icon]    │
│                                 │                  │
│   Drag to tag a region          │  [link-basic]    │
│                                 │  Page 45         │
│                                 │  [trash icon]    │
│                                 │                  │
└─────────────────────────────────┴──────────────────┘
```

**Left panel (70%):** `<TaggingCanvas />` — PDF with drag-select

**Right sidebar (30%):**
- Header: "Mappings (N)"
- Scrollable list of all existing `note_pdf_links` for this case
- Each entry: `link_id`, `label` (if any), `Page N`, delete (trash) button
- Clicking delete calls `deleteLink(id)` then refreshes the list

**Flow:**
1. Load case data: fetch `structure_items` by `caseId` → get `title` and `pdf_url`
2. Load existing links: `fetchLinksForItem(caseId)`
3. Parse `noteContentLinkIds` from `note_contents.content_html` — regex match all `data-link-id="([^"]+)"`
4. When `TaggingCanvas` fires `onRegionSelected` → open `<TagModal />`
5. When `TagModal` saves → call `insertLink(payload)` → close modal → refresh links list

---

## STYLE GUIDE

- Background: `#0f0e0b` (very dark brown-black)
- Text: `text-amber-50`, `text-amber-200`, `text-amber-400`
- Muted text: `text-amber-600`, `text-amber-700`
- Borders: `border-amber-900/30`, `border-amber-800/40`
- Accent buttons: `bg-amber-600 hover:bg-amber-500 text-white`
- Cards/panels: `bg-amber-950/20 border border-amber-900/30 rounded-lg`
- Danger/delete: `text-red-400 hover:text-red-300`
- Success: `text-green-400`
- Use Tailwind classes. No new fonts.
- Match the dark amber-gold legal aesthetic throughout.

---

## DO NOT

- Do not touch any files outside `src/app/admin/` and `src/app/admin/tag/[caseId]/`
- Do not modify `useVirtualPDF.ts`, `JudgmentPanel.tsx`, `NotesJudgmentLayout.tsx`, or any student-facing files
- Do not modify `/src/actions/judgment/links.ts` — use the existing exported functions
- Do not change the SCALE constant — it must stay `1.3` everywhere for coordinates to match
- Do not use `canvasContext` in pdfjs-dist render — use `{ canvas, viewport }` (v5 API)

---

## FILES TO CREATE / FULLY IMPLEMENT

1. `/src/app/admin/tag/page.tsx` — rewrite with proper full implementation
2. `/src/app/admin/tag/[caseId]/TaggingCanvas.tsx` — rewrite with proper full implementation
3. `/src/app/admin/tag/[caseId]/TagModal.tsx` — rewrite with proper full implementation
4. `/src/app/admin/tag/[caseId]/page.tsx` — rewrite with proper full implementation

Build one file at a time and confirm before moving to the next.
