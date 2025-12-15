import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Plus, Search, Edit, Trash2, HelpCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { SubjectFilter } from '@/components/ui/subject-filter'

export default async function QuizzesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; subject?: string }>
}) {
  const supabase = await createClient()
  const query = (await searchParams).q || ''
  const subjectFilter = (await searchParams).subject || 'all'

  // Fetch subjects for filter
  const { data: subjects } = await supabase
    .from('subjects')
    .select('id, name')
    .order('name')

  let quizzesQuery = supabase
    .from('quizzes')
    .select(`
      *,
      subjects (
        name
      ),
      questions (count)
    `)
    .order('order_index', { ascending: true })

  if (query) {
    quizzesQuery = quizzesQuery.ilike('title', `%${query}%`)
  }

  if (subjectFilter && subjectFilter !== 'all') {
    quizzesQuery = quizzesQuery.eq('subject_id', subjectFilter)
  }

  const { data: quizzes, error } = await quizzesQuery

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Quizzes</h1>
        <Link href="/admin/quizzes/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Create Quiz
          </Button>
        </Link>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 bg-card p-4 rounded-lg border border-border">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <form>
            <Input
              name="q"
              placeholder="Search quizzes..."
              className="pl-9"
              defaultValue={query}
            />
            {subjectFilter !== 'all' && (
              <input type="hidden" name="subject" value={subjectFilter} />
            )}
          </form>
        </div>
        
        <div className="w-full sm:w-[200px]">
          <SubjectFilter 
            subjects={subjects} 
            defaultValue={subjectFilter} 
            hiddenQuery={query || undefined}
          />
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead className="text-center">Questions</TableHead>
              <TableHead className="text-center">Order</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quizzes?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  No quizzes found.
                </TableCell>
              </TableRow>
            ) : (
              quizzes?.map((quiz: any) => (
                <TableRow key={quiz.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col">
                      <span>{quiz.title}</span>
                      {quiz.description && (
                        <span className="text-xs text-muted-foreground truncate max-w-[250px]">
                          {quiz.description}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="font-normal">
                      {quiz.subjects?.name || 'Unknown Subject'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex items-center justify-center gap-1 text-muted-foreground">
                      <HelpCircle className="w-3 h-3" />
                      <span>{quiz.questions?.[0]?.count || 0}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-center text-muted-foreground">
                    {quiz.order_index}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/quizzes/${quiz.id}/edit`}>
                        <Button variant="ghost" size="sm">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </Link>
                      <Button variant="ghost" size="sm" className="text-error hover:text-error hover:bg-error/10">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
