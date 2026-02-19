# Gavelogy Admin Panel

Admin dashboard for managing **Gavelogy** — a legal education platform built with **Next.js 16**, **Supabase**, and **TypeScript**.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.1.1 (App Router, Turbopack) |
| Language | TypeScript (strict) |
| Database / Auth | Supabase (PostgreSQL, Auth, Realtime) |
| Styling | Tailwind CSS v4 |
| UI Components | shadcn/ui (Radix primitives) |
| State Management | Zustand (client-side caching) |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Animations | Framer Motion |
| Package Manager | pnpm |

## Getting Started

```bash
pnpm install
pnpm run dev
```

Open [http://localhost:3000](http://localhost:3000). You will be redirected to `/auth/login` or `/admin/dashboard` based on auth state.

### Environment Variables

Create `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

## Architecture

### Server-Side Rendering (SSR) Strategy

All admin pages use **Server Components** for instant loading — no client-side loading spinners.

**How it works:**

1. **`src/proxy.ts`** (Next.js 16 proxy, formerly middleware) — Runs on every request. Calls `supabase.auth.getUser()` to revalidate and refresh JWT tokens. This ensures all subsequent `getSession()` calls are instant local cookie reads.

2. **`src/app/admin/layout.tsx`** (Server Component) — Performs a single server-side auth check: fetches the user, validates admin status, and passes the `adminUser` object down to `AdminLayoutClient` as props.

3. **`AdminLayoutClient`** — Client component that wraps children in `AdminProvider` and `RealtimeProvider`, receiving user data as props (no client-side auth calls).

4. **Data-heavy pages** (e.g., Course Studio, Notes, Quizzes) — Fetch data server-side via `createClient()` from `@/lib/supabase/server` and pass it as props or render directly.

**Key files:**
- `src/proxy.ts` — Token refresh proxy (runs before every request)
- `src/app/admin/layout.tsx` — Server-side auth gate
- `src/app/admin/admin-layout-client.tsx` — Client shell with providers
- `src/contexts/admin-context.tsx` — Simplified admin context (props only, no fetching)
- `src/lib/supabase/server.ts` — Server-side Supabase client factory
- `src/lib/supabase/client.ts` — Client-side Supabase client factory

### Realtime Presence System

File-level presence tracking showing which admin is working on which course. Designed to be **Supabase free-tier friendly** (no cursor tracking, no high-frequency updates).

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
│   ├── page.tsx                    # Root redirect (SSR)
│   ├── auth/login/                 # Login page
│   └── admin/
│       ├── layout.tsx              # Server Component auth gate
│       ├── admin-layout-client.tsx # Client shell (sidebar, header, providers)
│       ├── dashboard/              # Admin dashboard
│       ├── studio/                 # Course Studio (main feature)
│       │   ├── page.tsx            # Course list (SSR)
│       │   ├── studio-client.tsx   # Client-side course grid + DnD
│       │   └── [courseId]/         # Course detail IDE
│       │       ├── page.tsx        # SSR data fetch
│       │       └── course-detail-client.tsx # Structure tree + editor
│       ├── notes/                  # Case Notes (SSR)
│       └── quizzes/                # Quizzes (SSR)
├── components/
│   ├── admin/                      # Admin-specific components
│   │   ├── presence-badge.tsx      # Realtime presence badges
│   │   ├── presence-avatars.tsx    # Header presence display
│   │   └── case-list-view.tsx      # Case list grouped by year
│   ├── course/                     # Course components
│   │   ├── course-card.tsx         # Course card with DnD + presence
│   │   └── structure-tree.tsx      # Recursive folder/file tree
│   ├── editor/                     # Rich text + quiz editors
│   └── ui/                         # shadcn/ui primitives
├── contexts/
│   ├── admin-context.tsx           # Admin auth context
│   └── draft-context.tsx           # Unsaved changes tracking
├── hooks/
│   ├── use-courses.ts              # Course CRUD + caching
│   └── use-structure.ts            # Structure CRUD + caching
├── lib/
│   ├── realtime/
│   │   └── realtime-provider.tsx   # Supabase Realtime + Presence
│   ├── stores/
│   │   ├── course-store.ts         # Zustand course cache
│   │   ├── draft-store.ts          # Draft state
│   │   └── header-store.ts         # Dynamic header title/actions
│   ├── supabase/
│   │   ├── client.ts               # Browser Supabase client
│   │   └── server.ts               # Server Supabase client
│   └── utils.ts                    # cn() utility
├── types/                          # TypeScript type definitions
└── proxy.ts                        # Token refresh proxy (Next.js 16)
```

## Database Schema (Supabase)

### Core Tables

| Table | Purpose |
|-------|---------|
| `users` | Admin users with `is_admin` flag |
| `courses` | Course metadata (name, description, icon, order) |
| `structure_items` | Recursive tree structure (folders/files) with `parent_id` |
| `note_contents` | Rich text content linked to structure items |
| `attached_quizzes` | Quiz metadata linked to structure items |
| `quiz_questions` | Individual quiz questions with options |
| `contemporary_case_quizzes` | Standalone case-based quizzes |

### Key Relationships

```
courses → structure_items (1:many via course_id)
structure_items → structure_items (self-referential via parent_id)
structure_items → note_contents (1:many via item_id)
structure_items → attached_quizzes (1:1 via note_item_id)
attached_quizzes → quiz_questions (1:many via quiz_id)
```

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
- Header bar shows all online admins with page labels
- Free-tier Supabase friendly (page-level, not cursor-level)

## Important Conventions

1. **SSR first** — All pages fetch data server-side. Client components receive data as props.
2. **Proxy for auth** — `proxy.ts` refreshes tokens; never call `getUser()` in client components.
3. **Zustand for caching** — Use stores to cache fetched data; seed stores from SSR props using `useEffect` (not during render).
4. **No `isLoading` for auth** — Auth data is always available via SSR; no loading states needed for admin checks.
5. **URL search params** — Search on list pages uses `?q=` URL params with form submission (not client-side state).
6. **Tailwind v4** — Uses `bg-linear-to-br` (not `bg-gradient-to-br`).

## Scripts

```bash
pnpm run dev       # Start dev server (Turbopack)
pnpm run build     # Production build
pnpm run start     # Start production server
pnpm run lint      # Run ESLint
```
