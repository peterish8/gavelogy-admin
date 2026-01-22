'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, HelpCircle, Loader2, ChevronRight, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuizItem {
  id: string
  title?: string
  content: string | null
  item_id: string
  structure_items: {
    id: string
    title: string
    course_id: string
    courses: {
      id: string
      name: string
      icon: string
    }
  }
}

interface GroupedQuizzes {
  course: {
    id: string
    name: string
    icon: string
  }
  quizzes: QuizItem[]
}

export default function QuizzesPage() {
  const [quizzes, setQuizzes] = useState<QuizItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchQuizzes = async () => {
      try {
        const supabase = createClient()
        
        // First get all attached_quizzes with their structure items
        const { data: quizData, error: quizError } = await supabase
          .from('attached_quizzes')
          .select(`
            id, title, note_item_id,
            quiz_questions(id)
          `)

        if (quizError) throw quizError
        
        // Get the structure items and courses for these quizzes
        const itemIds = (quizData || []).map((q: any) => q.note_item_id).filter(Boolean)
        
        if (itemIds.length === 0) {
          setQuizzes([])
          setIsLoading(false)
          return
        }
        
        const { data: itemsData, error: itemsError } = await supabase
          .from('structure_items')
          .select(`
            id, title, course_id,
            courses(id, name, icon)
          `)
          .in('id', itemIds)
        
        if (itemsError) throw itemsError
        
        // Merge the data
        const itemsMap = new Map<string, any>((itemsData || []).map((item: any) => [item.id, item]))
        
        const transformedData = (quizData || [])
          .filter((quiz: any) => itemsMap.has(quiz.note_item_id))
          .map((quiz: any) => {
            const item = itemsMap.get(quiz.note_item_id)
            return {
              id: quiz.id,
              title: quiz.title,
              content: quiz.quiz_questions?.length > 0 ? 'has_questions' : null,
              item_id: quiz.note_item_id,
              structure_items: {
                id: item.id,
                title: item.title,
                course_id: item.course_id,
                courses: item.courses as any
              }
            }
          })
        setQuizzes(transformedData as QuizItem[])
      } catch (err) {
        console.error('Error fetching quizzes:', err)
        setError('Failed to load quizzes')
      } finally {
        setIsLoading(false)
      }
    }

    fetchQuizzes()
  }, [])

  // Filter quizzes based on search query
  const filteredQuizzes = useMemo(() => {
    if (!searchQuery.trim()) return quizzes
    const query = searchQuery.toLowerCase()
    return quizzes.filter(quiz => 
      quiz.structure_items?.title?.toLowerCase().includes(query) ||
      quiz.structure_items?.courses?.name?.toLowerCase().includes(query)
    )
  }, [quizzes, searchQuery])

  // Group quizzes by course
  const groupedQuizzes = useMemo(() => {
    const groups: Map<string, GroupedQuizzes> = new Map()
    
    filteredQuizzes.forEach(quiz => {
      if (!quiz.structure_items?.courses) return
      
      const courseId = quiz.structure_items.course_id
      if (!groups.has(courseId)) {
        groups.set(courseId, {
          course: quiz.structure_items.courses,
          quizzes: []
        })
      }
      groups.get(courseId)!.quizzes.push(quiz)
    })

    return Array.from(groups.values())
  }, [filteredQuizzes])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={() => window.location.reload()} variant="outline">
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Quizzes</h1>
          <p className="text-muted-foreground mt-1">All quizzes across all courses</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-card p-4 rounded-lg border border-border">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search quizzes by title or course..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Quizzes List Grouped by Course */}
      {groupedQuizzes.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-1">No quizzes found</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery ? 'Try a different search term' : 'Create quizzes in Course Studio'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedQuizzes.map((group) => (
            <div key={group.course.id} className="space-y-3">
              {/* Course Header */}
              <div className="flex items-center gap-3 pb-2 border-b border-border">
                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
                  {group.course.icon || '📚'}
                </div>
                <h2 className="text-lg font-semibold text-foreground">
                  {group.course.name}
                </h2>
                <span className="text-sm text-muted-foreground">
                  ({group.quizzes.length} {group.quizzes.length === 1 ? 'quiz' : 'quizzes'})
                </span>
              </div>

              {/* Quizzes Grid */}
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {group.quizzes.map((quiz) => (
                  <Link
                    key={quiz.id}
                    href={`/admin/quizzes/edit/${quiz.item_id}`}
                    className={cn(
                      "group flex items-center gap-3 p-4 bg-card border border-border rounded-xl",
                      "hover:border-purple-300 hover:shadow-md transition-all duration-200"
                    )}
                  >
                    <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center shrink-0">
                      <HelpCircle className="w-5 h-5 text-purple-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate group-hover:text-purple-600 transition-colors">
                        {quiz.structure_items?.title || 'Untitled Quiz'}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {quiz.content ? 'Has questions' : 'Empty'}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-purple-500 transition-colors" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
