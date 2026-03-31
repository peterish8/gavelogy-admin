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
      pyq_passages: {
        Row: {
          id: string
          test_id: string
          order_index: number
          passage_text: string
          citation: string | null
          section_number: string | null
          subject: string | null
          created_at: string
        }
        Insert: {
          id?: string
          test_id: string
          order_index?: number
          passage_text: string
          citation?: string | null
          section_number?: string | null
          subject?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          test_id?: string
          order_index?: number
          passage_text?: string
          citation?: string | null
          section_number?: string | null
          subject?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pyq_passages_test_id_fkey"
            columns: ["test_id"]
            referencedRelation: "pyq_tests"
            referencedColumns: ["id"]
          }
        ]
      }
      pyq_questions: {
        Row: {
          id: string
          test_id: string
          passage_id: string | null
          order_index: number
          question_text: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          correct_answer: 'A' | 'B' | 'C' | 'D'
          explanation: string | null
          marks: number
          subject: string | null
          question_type: string | null
          created_at: string
        }
        Insert: {
          id?: string
          test_id: string
          passage_id?: string | null
          order_index?: number
          question_text: string
          option_a: string
          option_b: string
          option_c: string
          option_d: string
          correct_answer: 'A' | 'B' | 'C' | 'D'
          explanation?: string | null
          marks?: number
          subject?: string | null
          question_type?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          test_id?: string
          passage_id?: string | null
          order_index?: number
          question_text?: string
          option_a?: string
          option_b?: string
          option_c?: string
          option_d?: string
          correct_answer?: 'A' | 'B' | 'C' | 'D'
          explanation?: string | null
          marks?: number
          subject?: string | null
          question_type?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pyq_questions_passage_id_fkey"
            columns: ["passage_id"]
            referencedRelation: "pyq_passages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pyq_questions_test_id_fkey"
            columns: ["test_id"]
            referencedRelation: "pyq_tests"
            referencedColumns: ["id"]
          }
        ]
      }
      pyq_tests: {
        Row: {
          id: string
          title: string
          exam_name: string
          year: number | null
          duration_minutes: number
          total_marks: number
          negative_marking: number
          instructions: string | null
          is_published: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          title: string
          exam_name?: string
          year?: number | null
          duration_minutes?: number
          total_marks?: number
          negative_marking?: number
          instructions?: string | null
          is_published?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          title?: string
          exam_name?: string
          year?: number | null
          duration_minutes?: number
          total_marks?: number
          negative_marking?: number
          instructions?: string | null
          is_published?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
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
