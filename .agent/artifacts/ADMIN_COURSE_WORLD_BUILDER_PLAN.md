# 🏗️ ADMIN COURSE WORLD BUILDER - Implementation Plan (FINAL)

## ⚠️ Updated with Shared Context from PRD 3

This plan aligns with the overall system transformation documented in `overallsharedcontext.md`. The key principle is: **Single Codebase, Dual Modes** - Admin controls are additive to the student interface.

---

## 🎯 Architectural Alignment

### From PRD 3 - Key Principles We Must Follow

| Principle | Implementation |
|-----------|----------------|
| Single Codebase, Dual Modes | Components check `isAdmin` and render extra controls |
| Course-First Navigation | URL structure: `/content/:courseId/...` |
| Draft vs Published | Admin changes saved to draft store, committed on "Save" |
| Interactive Engagement | T/F, Y/N questions embedded in notes with percentages |

### URL Structure (Aligned with PRD 3)

```
/content                                      → Course selector (StudentCourseList)
/content/:courseId                            → Course world (CourseWorld)
/content/:courseId/modules/:moduleId          → Module view (ModuleView)
/content/:courseId/content/:contentId/notes   → Notes viewer (NotesViewer)
/content/:courseId/content/:contentId/quiz    → Quiz player (QuizPlayer)
/content/:courseId/mistakes                   → Scoped mistakes (MistakesList)
```

**Admin sees the SAME URLs** but with authoring controls visible.

---

## 📊 Schema Mapping (Existing ↔ PRD 3 ↔ Implementation)

| PRD 3 Concept | Your Existing Table | Our Implementation |
|---------------|---------------------|-------------------|
| `courses` | `courses` ✅ | Add: `icon`, `order_index`, `version` |
| `course_modules` | `subjects` ✅ | Add: `icon`, `is_active`, `version` (use as modules) |
| `course_content` | NEW `content_items` | Create unified content table |
| `user_course_access` | `user_courses` ✅ | Already exists! |
| `user_course_progress` | `user_case_completion`, `quiz_attempts` ✅ | Already exists! |
| `interactive_questions` | NEW | Create |
| `user_question_responses` | NEW `interactive_responses` | Create |
| `admin_audit_log` | NEW | Create |
| `users.role` | `users.is_admin` | Add column |

### 🔑 Discovery: You already have `user_courses` table!
This handles course access/purchases. We'll leverage this for access control.

---

## 🗄️ Updated SQL Migration

Based on existing tables + PRD 3 requirements:

```sql
-- See .agent/artifacts/SUPABASE_MIGRATION_UPDATED.sql for full script
-- Key additions:
-- 1. ALTER courses (add icon, order_index, version)
-- 2. ALTER subjects (add icon, is_active, version) - serves as modules
-- 3. ALTER users (add is_admin)
-- 4. CREATE content_items (unified content model)
-- 5. CREATE interactive_questions
-- 6. CREATE interactive_responses
-- 7. CREATE admin_audit_log
```

---

## 🏗️ Directory Structure (Aligned with Shared Components)

```
src/
├── app/
│   ├── content/                              # NEW - Course World Routes
│   │   ├── page.tsx                          # Course selector
│   │   ├── [courseId]/
│   │   │   ├── page.tsx                      # Course world
│   │   │   ├── modules/[moduleId]/
│   │   │   │   └── page.tsx                  # Module view
│   │   │   ├── content/[contentId]/
│   │   │   │   ├── notes/page.tsx            # Notes viewer
│   │   │   │   └── quiz/page.tsx             # Quiz player
│   │   │   └── mistakes/page.tsx             # Course-scoped mistakes
│   │   └── layout.tsx                        # Course layout with nav
│   └── admin/                                # Existing admin pages (keep)
│
├── components/
│   ├── course/                               # SHARED components (admin + student)
│   │   ├── course-list.tsx                   # CourseNavigator (PRD 3)
│   │   ├── module-list.tsx                   # ContentList (PRD 3)
│   │   ├── content-card.tsx                  # Content item display
│   │   ├── notes-viewer.tsx                  # NotesViewer (PRD 3)
│   │   ├── quiz-player.tsx                   # QuizPlayer (PRD 3)
│   │   ├── interactive-question.tsx          # InteractiveQuestion (PRD 3)
│   │   └── mistakes-list.tsx                 # MistakesList
│   │
│   ├── admin/                                # Admin-only controls (additive)
│   │   ├── admin-controls.tsx                # Wrapper for admin actions
│   │   ├── drag-handle.tsx                   # Reorder handle (⋮⋮)
│   │   ├── inline-editor.tsx                 # Inline text editing
│   │   ├── add-button.tsx                    # [+ Add Content Here]
│   │   ├── save-bar.tsx                      # Sticky save/discard bar
│   │   └── confirmation-modal.tsx            # Delete/save confirmation
│   │
│   ├── editors/                              # Content editors (admin modals)
│   │   ├── rich-text-editor.tsx              # EXISTS
│   │   ├── note-editor.tsx                   # Note creation/editing
│   │   ├── quiz-editor.tsx                   # Quiz creation/editing
│   │   └── interactive-question-builder.tsx  # Interactive Q builder
│   │
│   └── ui/                                   # Existing shadcn components
│
├── contexts/
│   ├── admin-context.tsx                     # isAdmin state + beforeunload
│   └── draft-context.tsx                     # Draft state provider
│
├── hooks/
│   ├── use-admin.ts                          # Admin detection
│   ├── use-draft.ts                          # Draft state actions
│   ├── use-courses.ts                        # Course CRUD
│   ├── use-modules.ts                        # Module/Subject CRUD
│   ├── use-content.ts                        # Content item CRUD
│   └── use-course-access.ts                  # Check user course access
│
├── lib/
│   ├── stores/
│   │   └── draft-store.ts                    # Zustand draft state
│   └── supabase/
│       ├── client.ts                         # EXISTS
│       ├── server.ts                         # EXISTS
│       └── admin-api.ts                      # Admin-only operations
│
└── types/
    └── database.ts                           # UPDATE with new types
```

---

## 📋 Implementation Stages (Revised)

### Stage 1: Database & Infrastructure (Days 1-2)

| # | Task | File | Notes |
|---|------|------|-------|
| 1.1 | Run SQL migration | Supabase | Use `SUPABASE_MIGRATION_UPDATED.sql` |
| 1.2 | Set yourself as admin | Supabase | `UPDATE users SET is_admin = true WHERE email = '...'` |
| 1.3 | Install @dnd-kit | Terminal | `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities` |
| 1.4 | Update TypeScript types | `types/database.ts` | Add ContentItem, InteractiveQuestion, etc. |
| 1.5 | Create Admin Context | `contexts/admin-context.tsx` | Checks `users.is_admin` |
| 1.6 | Create Draft Store | `lib/stores/draft-store.ts` | Zustand store |

### Stage 2: Course Routes & Navigation (Days 3-5)

| # | Task | File | Notes |
|---|------|------|-------|
| 2.1 | Create `/content` layout | `app/content/layout.tsx` | With course nav sidebar |
| 2.2 | Create Course List page | `app/content/page.tsx` | Shows purchased courses |
| 2.3 | Create CourseList component | `components/course/course-list.tsx` | Shared: student + admin |
| 2.4 | Add admin controls | `components/admin/admin-controls.tsx` | Wrapper for edit/delete |
| 2.5 | Implement drag handle | `components/admin/drag-handle.tsx` | Visible only to admins |
| 2.6 | Create useCourses hook | `hooks/use-courses.ts` | Fetch with user access check |

### Stage 3: Course World & Modules (Days 6-8)

| # | Task | File | Notes |
|---|------|------|-------|
| 3.1 | Create Course World page | `app/content/[courseId]/page.tsx` | Shows modules (subjects) |
| 3.2 | Create ModuleList component | `components/course/module-list.tsx` | Shared: student + admin |
| 3.3 | Create Module card | `components/course/module-card.tsx` | With admin overlay |
| 3.4 | Create Add Button | `components/admin/add-button.tsx` | [+ Add Content Here] |
| 3.5 | Implement drag-drop reordering | Integrate @dnd-kit | In ModuleList |
| 3.6 | Create useModules hook | `hooks/use-modules.ts` | CRUD for subjects |

### Stage 4: Content View & Management (Days 9-11)

| # | Task | File | Notes |
|---|------|------|-------|
| 4.1 | Create Module View page | `app/content/[courseId]/modules/[moduleId]/page.tsx` | Shows content items |
| 4.2 | Create ContentCard component | `components/course/content-card.tsx` | Note/Quiz/Case display |
| 4.3 | Create Notes Viewer | `components/course/notes-viewer.tsx` | Rich HTML display |
| 4.4 | Create Quiz Player | `components/course/quiz-player.tsx` | Quiz taking interface |
| 4.5 | Create useContent hook | `hooks/use-content.ts` | Content items CRUD |
| 4.6 | Link to existing quizzes | Integration | Connect to existing quiz tables |

### Stage 5: Save/Discard System (Days 12-13)

| # | Task | File | Notes |
|---|------|------|-------|
| 5.1 | Create Save Bar | `components/admin/save-bar.tsx` | Sticky bottom bar |
| 5.2 | Create Confirmation Modal | `components/admin/confirmation-modal.tsx` | Save/Delete dialogs |
| 5.3 | Implement draft commit logic | `lib/stores/draft-store.ts` | Batch save to DB |
| 5.4 | Create Admin API | `lib/supabase/admin-api.ts` | Server-side operations |
| 5.5 | Add beforeunload warning | `contexts/admin-context.tsx` | Prevent navigation loss |
| 5.6 | Create audit logging | `lib/supabase/admin-api.ts` | Track admin actions |

### Stage 6: Content Editors (Days 14-16)

| # | Task | File | Notes |
|---|------|------|-------|
| 6.1 | Create Note Editor Modal | `components/editors/note-editor.tsx` | Full rich text editing |
| 6.2 | Enhance existing RichTextEditor | `components/editors/rich-text-editor.tsx` | Add interactive Q support |
| 6.3 | Create Quiz Editor Modal | `components/editors/quiz-editor.tsx` | Quiz building UI |
| 6.4 | Create Case Note Linker | `components/editors/case-note-linker.tsx` | Link existing case notes |
| 6.5 | Create Inline Editor | `components/admin/inline-editor.tsx` | Quick title editing |

### Stage 7: Interactive Questions (Days 17-18)

| # | Task | File | Notes |
|---|------|------|-------|
| 7.1 | Create InteractiveQuestion component | `components/course/interactive-question.tsx` | T/F, Y/N, Poll display |
| 7.2 | Create Interactive Q Builder | `components/editors/interactive-question-builder.tsx` | Admin creation UI |
| 7.3 | Implement response submission | `lib/supabase/admin-api.ts` | POST response, get stats |
| 7.4 | Create Response Stats display | In InteractiveQuestion | Show percentages |

### Stage 8: Course-Scoped Mistakes (Day 19)

| # | Task | File | Notes |
|---|------|------|-------|
| 8.1 | Create Mistakes page | `app/content/[courseId]/mistakes/page.tsx` | Filtered by course |
| 8.2 | Create MistakesList component | `components/course/mistakes-list.tsx` | Reuse existing logic |
| 8.3 | Update mistakes queries | Filter by course_id | Where applicable |

### Stage 9: Polish & Testing (Day 20)

| # | Task | Notes |
|---|------|-------|
| 9.1 | Add loading states | Skeleton screens |
| 9.2 | Add error handling | Toast notifications |
| 9.3 | Implement optimistic locking | Version check on save |
| 9.4 | Performance testing | 50+ items drag-drop |
| 9.5 | Security review | RLS policies |

---

## 🧩 Shared Component Pattern (From PRD 3)

Every component follows this pattern:

```tsx
// components/course/content-card.tsx
interface ContentCardProps {
  content: ContentItem
  isAdmin: boolean
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onReorder?: (id: string, direction: 'up' | 'down') => void
}

export function ContentCard({ content, isAdmin, onEdit, onDelete }: ContentCardProps) {
  return (
    <div className="relative group">
      {/* Student content - always shown */}
      <div className="p-4 border rounded-lg">
        <h3>{content.title}</h3>
        <p>{content.content_type}</p>
        <Link href={`/content/${content.courseId}/content/${content.id}/notes`}>
          View
        </Link>
      </div>
      
      {/* Admin controls - only shown to admins */}
      {isAdmin && (
        <AdminControls
          onEdit={() => onEdit?.(content.id)}
          onDelete={() => onDelete?.(content.id)}
        />
      )}
    </div>
  )
}
```

---

## 🔐 Access Control (From PRD 3)

### Course Access Check

```typescript
// hooks/use-course-access.ts
export function useCourseAccess(courseId: string) {
  const [hasAccess, setHasAccess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  
  useEffect(() => {
    async function checkAccess() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setHasAccess(false)
        setIsLoading(false)
        return
      }
      
      // Check if user has purchased this course
      const { data } = await supabase
        .from('user_courses')
        .select('id, status')
        .eq('user_id', user.id)
        .eq('course_id', courseId)
        .eq('status', 'active')
        .single()
      
      setHasAccess(!!data)
      setIsLoading(false)
    }
    
    checkAccess()
  }, [courseId])
  
  return { hasAccess, isLoading }
}
```

### Admin Check

```typescript
// contexts/admin-context.tsx
// Already defined - checks users.is_admin
```

---

## 📁 TypeScript Types (Complete)

```typescript
// types/database.ts - Add these

// Extended Course
export interface Course {
  id: string
  name: string
  description: string | null
  price: number
  is_active: boolean
  icon: string
  order_index: number
  version: number
  created_at: string
  updated_at: string
}

// Subject (serves as Module)
export interface Subject {
  id: string
  course_id: string
  name: string
  description: string | null
  order_index: number
  icon: string
  is_active: boolean
  version: number
  created_at: string
  updated_at: string
}

// Content Item
export interface ContentItem {
  id: string
  subject_id: string // Links to subjects (module)
  content_type: 'note' | 'quiz' | 'interactive' | 'case_note'
  title: string
  order_index: number
  is_active: boolean
  created_at: string
  updated_at: string
  version: number
  note_content: {
    html: string
    sections?: Array<{
      title: string
      content: string
    }>
  } | null
  quiz_id: string | null
  case_number: string | null
  interactive_data: {
    questions: InteractiveQuestion[]
  } | null
}

// Interactive Question
export interface InteractiveQuestion {
  id: string
  content_item_id: string
  question_text: string
  question_type: 'true_false' | 'yes_no' | 'poll'
  options: string[] | null
  correct_answer: string | null
  order_index: number
  created_at: string
}

// Interactive Response
export interface InteractiveResponse {
  id: string
  question_id: string
  user_id: string
  answer: string
  created_at: string
}

// Admin Audit Log
export interface AdminAuditLog {
  id: string
  admin_user_id: string
  action: 'create' | 'update' | 'delete' | 'reorder'
  entity_type: 'course' | 'subject' | 'content_item' | 'quiz' | 'question'
  entity_id: string
  old_data: any
  new_data: any
  created_at: string
}

// User Course Access (existing)
export interface UserCourseAccess {
  id: string
  user_id: string
  course_id: string
  course_name: string
  course_description: string
  course_price: number
  order_id: string
  status: 'active' | 'expired' | 'cancelled'
  purchase_date: string
  created_at: string
  updated_at: string
}
```

---

## 🚀 Implementation Priority

### Phase 1: Foundation (Days 1-5)
**Goal:** Working course navigation with admin controls

1. ✅ Database migration
2. ✅ Admin context & draft store
3. ✅ `/content` routes with course list
4. ✅ Admin sees drag handles & edit icons

### Phase 2: Content Management (Days 6-13)
**Goal:** Full CRUD for courses, modules, content

5. ✅ Module/Subject views
6. ✅ Content item views
7. ✅ Save/Discard system
8. ✅ Content editors

### Phase 3: Engagement Features (Days 14-18)
**Goal:** Interactive questions & course-scoped features

9. ✅ Interactive questions
10. ✅ Response tracking & percentages
11. ✅ Course-scoped mistakes

### Phase 4: Polish (Days 19-20)
**Goal:** Production-ready

12. ✅ Loading states & error handling
13. ✅ Performance optimization
14. ✅ Security review

---

## ✅ Acceptance Criteria (From PRD 3)

- [ ] Admins can create entire courses without dev help
- [ ] Students navigate courses without confusion
- [ ] Progress tracking works per-course
- [ ] Mistakes are properly scoped
- [ ] Interactive questions engage students
- [ ] Response percentages are accurate
- [ ] Draft/publish flow prevents broken content
- [ ] No security vulnerabilities
- [ ] Performance is acceptable (<2s page loads)
- [ ] Zero critical bugs in production

---

## 🚦 Ready to Start!

**Immediate next steps:**

1. **Run SQL migration** in Supabase
2. **Make yourself admin:** `UPDATE users SET is_admin = true WHERE email = '...'`
3. **Install packages:** `npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities`
4. **Start Stage 1:** Update types, create admin context, create draft store

Let me know when you've completed the SQL migration and I'll start implementing!
