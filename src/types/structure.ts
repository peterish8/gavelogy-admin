
export type ItemType = 'folder' | 'file'

export interface Course {
  id: string
  name: string
  description: string | null
  icon: string // emoji
  price: number
  is_active: boolean
  is_crash_course?: boolean
  order_index: number
  created_at: string
  updated_at: string
}

export interface StructureItem {
  id: string
  course_id: string
  parent_id: string | null // null = top level module in course
  item_type: ItemType
  title: string
  description: string | null
  icon: string | null
  is_active: boolean
  order_index: number
  created_at: string
  updated_at: string
  
  // Loaded recursively
  children?: StructureItem[]
  
  // Loaded if it's a file
  note_content?: NoteContent | null
  attached_quiz?: AttachedQuiz | null
}

export interface NoteContent {
  id: string
  item_id: string
  content_html: string | null
  created_at: string
  updated_at: string
}

export interface AttachedQuiz {
  id: string
  note_item_id: string
  title: string | null
  passing_score: number
  questions?: QuizQuestion[]
}

export interface QuizQuestion {
  id: string
  quiz_id: string
  question_text: string
  question_type: 'single_choice' | 'multi_choice' | 'true_false'
  options: string[] | null
  correct_answer: string
  explanation: string | null
  order_index: number
}
