# Gavelogy Admin Panel — Walkthrough

## Overview

The Gavelogy Admin Panel is a course management system built with **Next.js 16** (App Router, Turbopack), **Supabase**, and **Tailwind CSS v4**. It allows administrators to manage courses, notes, quizzes, and course structure through a studio-style interface.

## Architecture

### SSR-First Performance

All pages are **Server Components** that fetch data server-side — zero loading spinners.

**Auth flow:**
1. `proxy.ts` (Next.js 16 proxy) runs on every request → calls `supabase.auth.getUser()` to refresh JWT tokens
2. `admin/layout.tsx` (Server Component) → single DB query to verify admin status
3. `AdminLayoutClient` (Client Component) → receives admin data as props, wraps children in providers

**Data flow for pages:**
- **Course Studio** — SSR fetches course + structure data, seeds Zustand store via `useEffect`
- **Notes / Quizzes** — SSR fetches and renders directly (no client-side state)
- **Dashboard** — SSR with server-side metrics

### Realtime Presence System

File-level presence showing which admin is working on which course. **Supabase free-tier friendly** — no cursor tracking.

**How it works:**
1. `RealtimeProvider` auto-broadcasts current page on every navigation
2. `useAdminsByCourse()` groups presence data by course ID
3. `useAdminsOnCourse(courseId)` filters to a specific course
4. `PresenceBadge` / `PresenceBadgeStack` render initials with gradients and tooltips

**Where badges appear:**
- Course cards on `/admin/studio` (stacked initials)
- Course detail header on `/admin/studio/[courseId]`
- Header bar (all online admins with page labels)

### State Management

| Layer | Tool | Purpose |
|-------|------|---------|
| Server | Supabase server client | Auth + data fetching |
| Client cache | Zustand stores | Course, structure, draft, header state |
| Auth context | React Context (`AdminProvider`) | Props-only, no fetching |
| URL state | `searchParams` | Selected items, fullscreen, search queries |

## Key Features

### Course Studio (`/admin/studio`)
- Course CRUD with drag-and-drop reordering
- Recursive folder/file structure tree with inline editing
- Rich text editor (Tiptap) + quiz builder
- JSON export (current / template mode)
- Crash course quick-create

### Notes (`/admin/notes`)
- All notes across courses, grouped by course
- SSR with URL-based search (`?q=`)

### Quizzes (`/admin/quizzes`)
- All quizzes across courses, grouped by course
- SSR with URL-based search (`?q=`)

### Dashboard (`/admin/dashboard`)
- Metrics overview (total notes, quizzes, users)
- Quick action buttons

## Technical Conventions

1. **SSR first** — Fetch data in Server Components, pass as props
2. **Proxy for auth** — `proxy.ts` refreshes tokens; never `getUser()` in client components
3. **Zustand seeding** — Seed stores in `useEffect`, never during render (causes React errors)
4. **Tailwind v4** — Use `bg-linear-to-br` (not `bg-gradient-to-br`), `stroke-3` (not `stroke-[3]`)
5. **URL search** — List pages use `?q=` with form submission, not client-side `useState`
6. **No auth loading states** — Auth data always available from SSR

## Verification

- ✅ Build passes (`pnpm run build`, exit code 0)
- ✅ All routes compile: `/`, `/admin/dashboard`, `/admin/studio`, `/admin/notes`, `/admin/quizzes`
- ✅ No TypeScript errors (`tsc --noEmit` passes)
- ✅ No lint errors
- ✅ Case quizzes page removed (placeholder for future feature)
