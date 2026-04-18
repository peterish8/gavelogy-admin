'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { EditorPanel } from '@/components/course/editor-panel'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'

export default function QuizEditPage() {
  const params = useParams()
  const itemId = params.itemId as string
  
  const quizData = useQuery(api.adminQueries.getEntity, itemId ? { entityType: 'structure_items', id: itemId } : "skip") as any
  const courseData = useQuery(api.adminQueries.getEntity, quizData?.courseId ? { entityType: 'courses', id: quizData.courseId } : "skip") as any

  const isLoading = quizData === undefined || (quizData && quizData.courseId && courseData === undefined)
  const error = quizData === null ? 'Quiz not found' : null
  
  const mergedQuizData = quizData && courseData ? {
    title: quizData.title,
    course_id: quizData.courseId,
    courses: courseData
  } : null

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !mergedQuizData) {
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
            {mergedQuizData.courses?.icon || '📚'}
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{mergedQuizData.title}</h1>
            <p className="text-sm text-muted-foreground">
              {mergedQuizData.courses?.name} • Editing Quiz
            </p>
          </div>
        </div>
      </div>

      {/* Editor Panel - Quiz Only Mode - Takes full width */}
      <div className="flex-1 min-h-0 px-4">
        <EditorPanel
          itemId={itemId}
          itemType="file"
          courseId={mergedQuizData.course_id}
          title={mergedQuizData.title}
          mode="quiz-only"
        />
      </div>
    </div>
  )
}
