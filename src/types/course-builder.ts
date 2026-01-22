// Course Builder Types - Extended types for the Course World Builder
import { Json } from './database'

// =====================================================
// CORE ENTITIES
// =====================================================

export interface Course {
  id: string
  name: string
  description: string | null
  price: number
  is_active: boolean
  is_crash_course?: boolean
  icon: string
  order_index: number
  version: number
  created_at: string
  updated_at: string
}

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

export interface ContentItem {
  id: string
  subject_id: string
  content_type: 'note' | 'quiz' | 'interactive' | 'case_note'
  title: string
  order_index: number
  is_active: boolean
  created_at: string
  updated_at: string
  version: number
  note_content: NoteContent | null
  quiz_id: string | null
  case_number: string | null
  interactive_data: InteractiveData | null
}

// =====================================================
// CONTENT STRUCTURES
// =====================================================

export interface NoteContent {
  html: string
  sections?: NoteSection[]
}

export interface NoteSection {
  id: string
  title: string
  content: string
  order: number
}

export interface InteractiveData {
  questions: InteractiveQuestionInline[]
}

export interface InteractiveQuestionInline {
  id: string
  question_text: string
  question_type: 'true_false' | 'yes_no' | 'poll'
  options?: string[]
  correct_answer?: string
  position: number // Position in the note content
}

// =====================================================
// INTERACTIVE QUESTIONS
// =====================================================

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

export interface InteractiveResponse {
  id: string
  question_id: string
  user_id: string
  answer: string
  created_at: string
}

export interface QuestionStats {
  answer: string
  percentage: number
}

// =====================================================
// ADMIN & AUDIT
// =====================================================

export interface AdminAuditLog {
  id: string
  admin_user_id: string
  action: 'create' | 'update' | 'delete' | 'reorder'
  entity_type: 'course' | 'subject' | 'content_item' | 'quiz' | 'question'
  entity_id: string
  old_data: Json | null
  new_data: Json | null
  created_at: string
}

// =====================================================
// DRAFT STATE TYPES
// =====================================================

export type DraftAction = 'create' | 'update' | 'delete' | 'reorder'
export type EntityType = 'course' | 'subject' | 'content_item' | 'structure_item'

export interface DraftChange<T = unknown> {
  id: string
  action: DraftAction
  entityType: EntityType
  entityId: string
  data: Partial<T>
  originalData?: T
  timestamp: number
}

export interface DraftState {
  changes: DraftChange[]
  hasUnsavedChanges: boolean
}

// =====================================================
// UI PROPS TYPES (for shared components)
// =====================================================

export interface AdminControlsProps {
  onEdit?: () => void
  onDelete?: () => void
  onDuplicate?: () => void
  showDragHandle?: boolean
}

export interface ContentCardProps {
  content: ContentItem
  isAdmin: boolean
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
}

export interface CourseCardProps {
  course: Course
  isAdmin: boolean
  isExpanded?: boolean
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onToggleExpand?: () => void
}

export interface SubjectCardProps {
  subject: Subject
  isAdmin: boolean
  onEdit?: (id: string) => void
  onDelete?: (id: string) => void
  onClick?: () => void
}

// =====================================================
// CONTEXT TYPES
// =====================================================

export interface AdminContextType {
  isAdmin: boolean
  isLoading: boolean
  userId: string | null
}

export interface DraftContextType {
  hasUnsavedChanges: boolean
  changes: DraftChange[]
  addChange: (change: Omit<DraftChange, 'id' | 'timestamp'>) => void
  removeChange: (entityId: string) => void
  getChangeForEntity: (entityId: string) => DraftChange | undefined
  clearChanges: () => void
  commitChanges: () => Promise<void>
}

// =====================================================
// API RESPONSE TYPES
// =====================================================

export interface CourseWithSubjects extends Course {
  subjects: Subject[]
}

export interface SubjectWithContent extends Subject {
  content_items: ContentItem[]
}

export interface CourseHierarchy extends Course {
  subjects: SubjectWithContent[]
}
