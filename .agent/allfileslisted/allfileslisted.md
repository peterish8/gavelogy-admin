# Gavelogy Admin - Project File Documentation

> **Purpose**: This file maps all pages, components, and utilities in the project so AI assistants can quickly understand what files to edit for specific features.

---

## Table of Contents
1. [Pages & Routes](#pages--routes)
2. [Core Components](#core-components)
3. [Hooks](#hooks)
4. [State Stores](#state-stores)
5. [Utilities](#utilities)
6. [Database Tables](#database-tables)
7. [Quick Reference](#quick-reference)

---

## Pages & Routes

### Root Level
| Route | File | Purpose |
|-------|------|---------|
| `/` | `src/app/page.tsx` | Landing/redirect page |
| `/auth/*` | `src/app/auth/*` | Authentication pages |

### Admin Dashboard
| Route | File | Purpose |
|-------|------|---------|
| `/admin` | `src/app/admin/layout.tsx` | **Admin layout** - sidebar, header, navigation |
| `/admin/dashboard` | `src/app/admin/dashboard/page.tsx` | Dashboard with stats overview |

### Notes Management
| Route | File | Purpose |
|-------|------|---------|
| `/admin/notes` | `src/app/admin/notes/page.tsx` | **Notes listing** - shows all notes grouped by course with search |
| `/admin/notes/edit/[itemId]` | `src/app/admin/notes/edit/[itemId]/page.tsx` | **Edit note** - uses EditorPanel in notes-only mode |
| `/admin/notes/new` | `src/app/admin/notes/new/page.tsx` | Create new note |
| `/admin/notes/[caseNumber]` | `src/app/admin/notes/[caseNumber]/*` | Case notes (legacy system) |

### Quiz Management
| Route | File | Purpose |
|-------|------|---------|
| `/admin/quizzes` | `src/app/admin/quizzes/page.tsx` | **Quiz listing** - shows all quizzes grouped by course with search |
| `/admin/quizzes/edit/[itemId]` | `src/app/admin/quizzes/edit/[itemId]/page.tsx` | **Edit quiz** - uses EditorPanel in quiz-only mode |
| `/admin/quizzes/new` | `src/app/admin/quizzes/new/page.tsx` | Create new quiz |
| `/admin/quizzes/[quizId]` | `src/app/admin/quizzes/[quizId]/page.tsx` | Edit standalone quiz (legacy) |

### Course Studio
| Route | File | Purpose |
|-------|------|---------|
| `/admin/studio` | `src/app/admin/studio/page.tsx` | **Course management** - list/create/reorder courses |
| `/admin/studio/[courseId]` | `src/app/admin/studio/[courseId]/page.tsx` | **Course detail** - structure tree + EditorPanel (notes & quiz together) |
| `/admin/studio/[courseId]/content/[itemId]` | `src/app/admin/studio/[courseId]/content/[itemId]/page.tsx` | Direct content editing |

### Case Quizzes
| Route | File | Purpose |
|-------|------|---------|
| `/admin/case-quizzes` | `src/app/admin/case-quizzes/*` | Case-based quiz management |

---

## Core Components

### Course Components (`src/components/course/`)

| Component | File | Purpose | Key Props |
|-----------|------|---------|-----------|
| **EditorPanel** | `editor-panel.tsx` | Rich text editor for notes + quiz editor | `itemId`, `courseId`, `title`, `mode: 'all' \| 'notes-only' \| 'quiz-only'` |
| **QuizPreview** | `quiz-preview.tsx` | Interactive quiz preview with edit capability | `content`, `onContentChange` |
| **CourseCard** | `course-card.tsx` | Course display card in studio | `course`, `onEdit`, `onDelete` |
| **StructureTree** | `structure-tree.tsx` | Folder/file tree for course content | `items`, `onSelect`, `selectedId` |
| **ContentCard** | `content-card.tsx` | Content item card display | `item`, `onClick` |
| **CourseDeclarationModal** | `course-declaration-modal.tsx` | Modal for declaring course structure | - |
| **NewCourseDeclarationModal** | `new-course-declaration-modal.tsx` | Enhanced course declaration modal | - |
| **SubjectCard** | `subject-card.tsx` | Subject display card | `subject` |

### UI Components (`src/components/ui/`)
Standard shadcn/ui components: Button, Input, Card, Dialog, Tabs, Select, Popover, etc.

### Admin Components (`src/components/admin/`)
Admin-specific UI components.

---

## Hooks (`src/hooks/`)

| Hook | File | Purpose | Returns |
|------|------|---------|---------|
| `useCourses` | `use-courses.ts` | Fetch all courses | `{ courses, isLoading, error, refetch }` |
| `useCourse` | `use-courses.ts` | Fetch single course | `{ course, isLoading, error }` |
| `useCourseActions` | `use-courses.ts` | CRUD for courses | `{ createCourse, updateCourse, deleteCourse, reorderCourse }` |
| `useStructure` | `use-structure.ts` | Fetch course structure (items) | `{ items, isLoading, buildTree, refetch }` |
| `useContent` | `use-content.ts` | Fetch content for item | `{ content, isLoading, error }` |
| `useSubjects` | `use-subjects.ts` | Fetch subjects | `{ subjects, isLoading }` |

---

## State Stores (`src/lib/stores/`)

| Store | File | Purpose |
|-------|------|---------|
| **draftStore** | `draft-store.ts` | Manage draft content changes (unsaved edits) |
| **courseStore** | `course-store.ts` | Course state management |
| **localContentCache** | `local-content-cache.ts` | Local cache for content editing |

---

## Utilities (`src/lib/`)

| Utility | File | Purpose |
|---------|------|---------|
| `parseQuizText` / `serializeQuiz` | `quiz-parser.ts` | Convert quiz text ↔ structured data |
| `htmlToCustom` / `customToHtml` | `content-converter.ts` | Convert HTML ↔ custom format for storage |
| `cn` | `utils.ts` | Tailwind class name utility |
| `createClient` | `supabase/client.ts` | Supabase browser client |
| `createClient` | `supabase/server.ts` | Supabase server client |

---

## Database Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `courses` | Store courses | `id`, `name`, `icon`, `order_index` |
| `structure_items` | Course content structure (folders/files) | `id`, `course_id`, `parent_id`, `item_type`, `title`, `order_index` |
| `note_contents` | Published note content | `id`, `item_id`, `html_content` |
| `attached_quizzes` | Quizzes attached to notes | `id`, `note_item_id`, `title` |
| `quiz_questions` | Questions for attached quizzes | `id`, `quiz_id`, `question`, `options`, `correct_answer` |
| `draft_content_cache` | Draft (unpublished) content | `id`, `item_id`, `draft_content` |
| `quizzes` | Standalone quizzes (legacy) | `id`, `item_id`, `content` |

---

## Quick Reference

### "I want to edit..."

| Feature | Files to Edit |
|---------|--------------|
| **Sidebar Navigation** | `src/app/admin/layout.tsx` |
| **Notes listing page** | `src/app/admin/notes/page.tsx` |
| **Notes editor** | `src/components/course/editor-panel.tsx` |
| **Quiz listing page** | `src/app/admin/quizzes/page.tsx` |
| **Quiz editor/preview** | `src/components/course/editor-panel.tsx`, `src/components/course/quiz-preview.tsx` |
| **Quiz text parsing** | `src/lib/quiz-parser.ts` |
| **Course studio** | `src/app/admin/studio/page.tsx` |
| **Course detail/structure** | `src/app/admin/studio/[courseId]/page.tsx`, `src/components/course/structure-tree.tsx` |
| **Course cards** | `src/components/course/course-card.tsx` |
| **Draft saving** | `src/lib/stores/draft-store.ts` |
| **Content fetching** | `src/hooks/use-structure.ts`, `src/hooks/use-content.ts` |

### "I want to add..."

| Feature | Files to Create/Edit |
|---------|---------------------|
| **New admin page** | Create `src/app/admin/[pagename]/page.tsx`, add to sidebar in `layout.tsx` |
| **New component** | Create in `src/components/[category]/[name].tsx` |
| **New hook** | Create in `src/hooks/use-[name].ts`, export from `src/hooks/index.ts` |
| **New store** | Create in `src/lib/stores/[name]-store.ts` |

---

## File Naming Conventions

- **Pages**: `page.tsx` in route folder
- **Layouts**: `layout.tsx` in route folder
- **Components**: `kebab-case.tsx` (e.g., `editor-panel.tsx`)
- **Hooks**: `use-[name].ts` (e.g., `use-courses.ts`)
- **Stores**: `[name]-store.ts` (e.g., `draft-store.ts`)
- **Dynamic routes**: `[paramName]` folder (e.g., `[courseId]`)

---

*Last Updated: 2026-01-18*
