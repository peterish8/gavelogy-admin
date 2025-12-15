export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      contemprory_case_notes: {
        Row: {
          case_number: string
          overall_content: string
        }
        Insert: {
          case_number: string
          overall_content: string
        }
        Update: {
          case_number?: string
          overall_content?: string
        }
        Relationships: []
      }
      quizzes: {
        Row: {
          id: string
          subject_id: string
          title: string
          description: string | null
          order_index: number
        }
        Insert: {
          id?: string
          subject_id: string
          title: string
          description?: string | null
          order_index: number
        }
        Update: {
          id?: string
          subject_id?: string
          title?: string
          description?: string | null
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_subject_id_fkey"
            columns: ["subject_id"]
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          }
        ]
      }
      contemporary_case_quizzes: {
        Row: {
          id: string
          case_name: string
          case_number: string
          passage: string | null
          case_question_id: string
          question: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          correct_answer: 'A' | 'B' | 'C' | 'D'
          explanation: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          case_name: string
          case_number: string
          passage?: string | null
          case_question_id?: string
          question: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          correct_answer: 'A' | 'B' | 'C' | 'D'
          explanation?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          case_name?: string
          case_number?: string
          passage?: string | null
          case_question_id?: string
          question?: string
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          correct_answer?: 'A' | 'B' | 'C' | 'D'
          explanation?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      questions: {
        Row: {
          id: string
          quiz_id: string
          question_text: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          correct_answer: 'A' | 'B' | 'C' | 'D'
          explanation: string | null
          order_index: number
        }
        Insert: {
          id?: string
          quiz_id: string
          question_text: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          correct_answer: 'A' | 'B' | 'C' | 'D'
          explanation?: string | null
          order_index: number
        }
        Update: {
          id?: string
          quiz_id?: string
          question_text?: string
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          correct_answer?: 'A' | 'B' | 'C' | 'D'
          explanation?: string | null
          order_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "questions_quiz_id_fkey"
            columns: ["quiz_id"]
            referencedRelation: "quizzes"
            referencedColumns: ["id"]
          }
        ]
      }
      subjects: {
        Row: {
          id: string
          course_id: string
          name: string
          description: string | null
          order_index: number
        }
        Insert: {
          id?: string
          course_id: string
          name: string
          description?: string | null
          order_index: number
        }
        Update: {
          id?: string
          course_id?: string
          name?: string
          description?: string | null
          order_index?: number
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
