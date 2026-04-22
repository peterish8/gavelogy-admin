# Gavelogy Admin Panel

Admin dashboard for managing **Gavelogy** — a legal education platform built with **Next.js 16**, **Convex**, and **TypeScript**.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Backend / DB | **Convex** (Serverless DB, Realtime) |
| Authentication | **Convex Auth** (@convex-dev/auth) |
| Storage | **Backblaze B2** (via S3-compatible SDK) |
| AI Pipeline | Multi-provider (NVIDIA, Groq, OpenRouter, Cerebras) |
| Styling | Tailwind CSS v4 |
| UI Components | shadcn/ui (Radix primitives) |
| Package Manager | npm |

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to `/auth/login` or `/admin/dashboard` based on auth state.

### Environment Variables

Create `.env.local`:

```env
# Convex
CONVEX_DEPLOYMENT=<your-deployment-url>
NEXT_PUBLIC_CONVEX_URL=<your-public-convex-url>

# Storage (Backblaze B2)
BACKBLAZE_BUCKET_ENDPOINT=...
BACKBLAZE_KEY_ID=...
BACKBLAZE_APP_KEY=...
BACKBLAZE_BUCKET_NAME=...

# AI API Keys
GROQ_API_KEY=...
OPENROUTER_API_KEY=...
NVIDIA_API_KEY=...
CEREBRAS_API_KEY=...

# Admin Secret (Internal server-to-server calls)
ADMIN_API_SECRET=...
```

## Architecture

### Authentication Strategy

The admin panel uses a **hybrid authentication system** to support both browser-based users and automated server-to-server calls (e.g., Telegram bots, MCP agents).

1.  **Browser Session**: Users are authenticated via `@convex-dev/auth`. The `AdminLayout` ensures all sessions are valid before rendering admin features.
2.  **Server Secret**: API routes accept the `x-admin-secret` header. This allows trusted external services (like the Telegram Bot or Python scripts) to trigger AI processing.
3.  **Unified Auth Check**: All AI routes use `isAdminApiRequest(req)` (see `src/lib/admin-auth.ts`) which validates either the Convex session OR the secret header.

### Admin AI Pipeline

Most AI features (Case Summarization, News Extraction, Quiz Generation) follow a **reliable fallback cascade**:

- **Priority Cascade**: Tries high-capacity models first (e.g., NVIDIA Kimi K2.5) then falls back to fast/free models (Groq Llama 3.3, OpenRouter Gemini Flash).
- **Timeouts**: Every provider call is wrapped in an `AbortSignal.timeout(25_000)` to ensure a single slow provider doesn't hang the entire request.
- **Provider Transparency**: Each successful AI response includes a `provider` field identifying which model finally produced the result.

**Key AI API Routes:**
- `src/app/api/ai-summarize` — Judgment-to-Note generation
- `src/app/api/ai-news` — Legal news extraction from newspapers
- `src/app/api/ai-quiz` — Automatic MCQ generation from case notes
- `src/app/api/ai-format` — Raw text to Gavelogy tagged markup

### Realtime Presence System

Shows which admins are currently online and what they're viewing. Powered by **Convex Realtime**.

**How it works:**

1. `RealtimeProvider` subscribes to a Supabase Realtime Presence channel.
2. On every navigation (`usePathname()` change), it broadcasts the admin's `current_page` path.
3. Custom hooks extract course IDs from pathnames and group admins by course.
4. `PresenceBadge` / `PresenceBadgeStack` components render initials with gradient backgrounds and hover tooltips.

**Key files:**
- `src/lib/realtime/realtime-provider.tsx` — Presence channel, auto page tracking, hooks:
  - `useActiveAdmins()` — All online admins
  - `useAdminsOnCourse(courseId)` — Admins on a specific course
  - `useAdminsByCourse()` — Admins grouped by course ID
- `src/components/admin/presence-badge.tsx` — `PresenceBadge` and `PresenceBadgeStack`
- `src/components/admin/presence-avatars.tsx` — Header presence display

**Where badges appear:**
- Course cards in `/admin/studio` (bottom-left corner)
- Course detail header in `/admin/studio/[courseId]` (next to course name)
- Header bar (all online admins with current page labels)

### State Management

- **Zustand stores** (`src/lib/stores/`) — Client-side caching for courses, structure, drafts, and header state. Stores are seeded with SSR data on mount to avoid re-fetching.
- **React Context** — `AdminProvider` for auth state, `DraftProvider` for unsaved changes tracking.
- **URL State** — Selected items and fullscreen mode in the Course Studio are persisted in URL search params.

## Project Structure

```
src/
├── app/
│   ├── auth/                       # Login and signup flows
│   ├── admin/                      # Auth-gated admin shell
│   │   ├── layout.tsx              # Auth gate (Convex-based)
│   │   ├── studio/                 # Course Studio (Main feature)
│   │   ├── notes/                  # Notes management
│   │   └── quizzes/                # Quiz management
│   └── api/
│       ├── ai-*/                   # AI processing endpoints
│       └── auth/                   # Custom auth handlers
├── components/
│   ├── admin/                      # Presence and layout components
│   ├── course/                     # Studio-specific UI (Trees, Cards)
│   └── ui/                         # shadcn/ui primitives
├── contexts/
│   └── auth-context.tsx            # Global Convex auth state
├── lib/
│   ├── admin-auth.ts               # Unified API auth logic
│   ├── b2-client.ts                # Backblaze B2 S3 Client
│   └── prompts.ts                  # Legal-specialized system prompts
└── convex/                         # Backend functions and schema
```

## Database Schema (Convex)

Convex handles all indexing and relationships automatically. Key objects include `courses`, `structure_items`, `note_contents`, and `quiz_questions`.

## Key Features

### Course Studio (`/admin/studio`)
- **Course CRUD** — Create, edit, delete, reorder courses with drag-and-drop
- **Structure Tree** — Recursive folder/file tree with inline editing, DnD reordering, and search filtering
- **Rich Text Editor** — Full note editor with formatting toolbar
- **Quiz Builder** — Create and edit quizzes attached to structure items
- **Crash Course** — Quick course creation mode
- **JSON Export** — Copy course structure as JSON (current or template mode)

### Notes (`/admin/notes`)
- Lists all notes across all courses, grouped by course
- Server-side rendered with URL-based search

### Quizzes (`/admin/quizzes`)
- Lists all quizzes across all courses, grouped by course
- Server-side rendered with URL-based search

### Realtime Presence
- Shows which admins are currently online and what they're viewing
- Initials badges on course cards and course detail headers
- Global Header bar shows all online admins with page labels
- Powered by Convex realtime presence

## Important Conventions

1.  **Auth Guard**: Always check auth via `isAdminApiRequest(req)` in new API routes.
2.  **Provider Timeouts**: Every `fetch` to an AI provider MUST include a `signal: AbortSignal.timeout(ms)` to prevent hanging.
3.  **No `proxy.ts`**: The project no longer uses a middleware-based proxy; auth is now handled directly by Convex and the `AdminLayout`.
4.  **Tailwind v4**: Uses modern CSS variables and `bg-linear-to-br` syntax.

## Scripts

```bash
pnpm run dev       # Start dev server (Turbopack)
pnpm run build     # Production build
pnpm run start     # Start production server
pnpm run lint      # Run ESLint
```
