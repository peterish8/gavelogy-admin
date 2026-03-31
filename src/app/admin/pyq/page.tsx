import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Plus, ClipboardList, Clock, FileQuestion, Eye, Pencil, BookOpen, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DeletePyqButton } from '@/app/admin/pyq/delete-pyq-button'

interface PYQTest {
  id: string
  title: string
  exam_name: string
  year: number | null
  duration_minutes: number
  total_marks: number
  negative_marking: number
  is_published: boolean
  created_at: string
  question_count: number
}

// Server page that lists all PYQ mock tests with summary stats and links to edit/preview flows.
export default async function PYQListPage() {
  const supabase = await createClient()

  const { data: rawTests } = await supabase
    .from('pyq_tests')
    .select(`id, title, exam_name, year, duration_minutes, total_marks, negative_marking, is_published, created_at, pyq_questions(id)`)
    .order('created_at', { ascending: false })

  // Flattens the joined question rows into a count per test for the stats chips and cards.
  const tests: PYQTest[] = (rawTests || []).map((t: any) => ({
    ...t,
    question_count: t.pyq_questions?.length ?? 0,
  }))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">PYQ Mock Tests</h1>
          <p className="text-muted-foreground mt-1">Previous Year Question papers — create, edit and preview full mock exams</p>
        </div>
        <Link
          href="/admin/pyq/new"
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-xl font-semibold shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Test
        </Link>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Tests', value: tests.length, icon: ClipboardList, color: 'text-primary bg-primary/10' },
          { label: 'Published', value: tests.filter(t => t.is_published).length, icon: Eye, color: 'text-green-600 bg-green-50' },
          { label: 'Total Questions', value: tests.reduce((a, t) => a + t.question_count, 0), icon: FileQuestion, color: 'text-purple-600 bg-purple-50' },
          { label: 'Draft', value: tests.filter(t => !t.is_published).length, icon: Pencil, color: 'text-amber-600 bg-amber-50' },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center shrink-0', stat.color)}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tests List */}
      {tests.length === 0 ? (
        <div className="text-center py-20 bg-card rounded-xl border border-border border-dashed">
          <ClipboardList className="w-14 h-14 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-1">No PYQ tests yet</h3>
          <p className="text-sm text-muted-foreground mb-6">Create your first mock test by pasting questions from a PDF</p>
          <Link
            href="/admin/pyq/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create First Test
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tests.map(test => (
            <div
              key={test.id}
              className="group bg-card border border-border rounded-xl p-5 flex flex-col gap-4 hover:border-primary/40 hover:shadow-md transition-all duration-200"
            >
              {/* Top row */}
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <BookOpen className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground leading-tight">{test.title}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {test.exam_name}{test.year ? ` · ${test.year}` : ''}
                    </p>
                  </div>
                </div>
                <span className={cn(
                  'shrink-0 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full',
                  test.is_published
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400'
                )}>
                  {test.is_published ? 'Published' : 'Draft'}
                </span>
              </div>

              {/* Metadata chips */}
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="flex items-center gap-1 bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
                  <Clock className="w-3 h-3" />
                  {test.duration_minutes} min
                </span>
                <span className="flex items-center gap-1 bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
                  <FileQuestion className="w-3 h-3" />
                  {test.question_count} questions
                </span>
                <span className="flex items-center gap-1 bg-muted text-muted-foreground px-2.5 py-1 rounded-full">
                  −{test.negative_marking} marking
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1 border-t border-border">
                <Link
                  href={`/admin/pyq/${test.id}/edit`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit
                </Link>
                <Link
                  href={`/admin/pyq/${test.id}/preview`}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-bold text-primary hover:bg-primary/10 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview Exam
                  <ChevronRight className="w-3 h-3" />
                </Link>
                <DeletePyqButton
                  testId={test.id}
                  testTitle={test.title}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
