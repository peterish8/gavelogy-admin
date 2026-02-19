import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Search, HelpCircle, ChevronRight, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

interface QuizItem {
  id: string
  title?: string
  hasQuestions: boolean
  item_id: string
  itemTitle: string
  course: {
    id: string
    name: string
    icon: string
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

export default async function QuizzesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  const query = (await searchParams).q || ''

  // Fetch attached quizzes with question counts
  const { data: quizData } = await supabase
    .from('attached_quizzes')
    .select(`
      id, title, note_item_id,
      quiz_questions(id)
    `)

  // Get structure items and courses for these quizzes
  const itemIds = (quizData || []).map((q: any) => q.note_item_id).filter(Boolean)

  let quizzes: QuizItem[] = []

  if (itemIds.length > 0) {
    const { data: itemsData } = await supabase
      .from('structure_items')
      .select(`
        id, title, course_id,
        courses(id, name, icon)
      `)
      .in('id', itemIds)

    const itemsMap = new Map<string, any>((itemsData || []).map((item: any) => [item.id, item]))

    quizzes = (quizData || [])
      .filter((quiz: any) => itemsMap.has(quiz.note_item_id))
      .map((quiz: any) => {
        const item = itemsMap.get(quiz.note_item_id)
        return {
          id: quiz.id,
          title: quiz.title,
          hasQuestions: quiz.quiz_questions?.length > 0,
          item_id: quiz.note_item_id,
          itemTitle: item.title,
          course: item.courses as any
        }
      })
  }

  // Filter by search query
  const filteredQuizzes = query
    ? quizzes.filter(quiz =>
        quiz.itemTitle?.toLowerCase().includes(query.toLowerCase()) ||
        quiz.course?.name?.toLowerCase().includes(query.toLowerCase())
      )
    : quizzes

  // Group by course
  const groups: Map<string, GroupedQuizzes> = new Map()
  filteredQuizzes.forEach(quiz => {
    if (!quiz.course) return
    const courseId = quiz.course.id
    if (!groups.has(courseId)) {
      groups.set(courseId, { course: quiz.course, quizzes: [] })
    }
    groups.get(courseId)!.quizzes.push(quiz)
  })
  const groupedQuizzes = Array.from(groups.values())

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
          <form>
            <Input
              name="q"
              placeholder="Search quizzes by title or course..."
              className="pl-9"
              defaultValue={query}
            />
          </form>
        </div>
      </div>

      {/* Quizzes List Grouped by Course */}
      {groupedQuizzes.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-1">No quizzes found</h3>
          <p className="text-sm text-muted-foreground">
            {query ? 'Try a different search term' : 'Create quizzes in Course Studio'}
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
                        {quiz.itemTitle || 'Untitled Quiz'}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {quiz.hasQuestions ? 'Has questions' : 'Empty'}
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
