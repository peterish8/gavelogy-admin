'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { EditorPanel } from '@/components/course/editor-panel'

interface QuizData {
  id: string
  title: string
  course_id: string
  courses: {
    id: string
    name: string
    icon: string
  }
}

export default function QuizEditPage() {
  const params = useParams()
  const itemId = params.itemId as string
  
  const [quizData, setQuizData] = useState<QuizData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchQuiz = async () => {
      try {
        const supabase = createClient()
        const { data, error: fetchError } = await supabase
          .from('structure_items')
          .select(`
            id, title, course_id,
            courses(id, name, icon)
          `)
          .eq('id', itemId)
          .single()

        if (fetchError) throw fetchError
        if (data) {
          setQuizData({
            id: data.id,
            title: data.title,
            course_id: data.course_id,
            courses: data.courses as any
          })
        }
      } catch (err) {
        console.error('Error fetching quiz:', err)
        setError('Failed to load quiz')
      } finally {
        setIsLoading(false)
      }
    }

    if (itemId) {
      fetchQuiz()
    }
  }, [itemId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !quizData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <p className="text-destructive mb-4">{error || 'Quiz not found'}</p>
        <Link href="/admin/quizzes">
          <Button variant="outline">Back to Quizzes</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col w-full">
      {/* Header */}
      <div className="flex items-center gap-4 shrink-0 mb-4 px-4">
        <Link href="/admin/quizzes">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-lg">
            {quizData.courses?.icon || '📚'}
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{quizData.title}</h1>
            <p className="text-sm text-muted-foreground">
              {quizData.courses?.name} • Editing Quiz
            </p>
          </div>
        </div>
      </div>

      {/* Editor Panel - Quiz Only Mode - Takes full width */}
      <div className="flex-1 min-h-0 px-4">
        <EditorPanel
          itemId={itemId}
          itemType="file"
          courseId={quizData.course_id}
          title={quizData.title}
          mode="quiz-only"
        />
      </div>
    </div>
  )
}
