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
import { Plus, Search, Edit, Trash2, FileText } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

export default async function CaseQuizzesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  const query = (await searchParams).q || ''

  // We need to group by case_number since multiple questions belong to one case
  // Supabase doesn't support GROUP BY in the JS client easily for this view
  // So we'll fetch distinct case numbers or just list all questions
  // A better approach for the UI is to list "Cases" that have quizzes
  
  // Let's fetch all unique case numbers/names first
  // Since we can't do distinct easily, we'll fetch all and process in JS (assuming not huge dataset yet)
  // Or better, we just list individual questions but that's messy.
  // Let's try to fetch all and group by case_number on the client/server side
  
  let quizzesQuery = supabase
    .from('contemporary_case_quizzes')
    .select('*')
    .order('created_at', { ascending: false })

  if (query) {
    quizzesQuery = quizzesQuery.or(`case_name.ilike.%${query}%,case_number.ilike.%${query}%`)
  }

  const { data: questions, error } = await quizzesQuery

  // Group by case_number
  const groupedCases = questions?.reduce((acc: any, curr) => {
    if (!acc[curr.case_number]) {
      acc[curr.case_number] = {
        case_number: curr.case_number,
        case_name: curr.case_name,
        question_count: 0,
        questions: []
      }
    }
    acc[curr.case_number].question_count++
    acc[curr.case_number].questions.push(curr)
    return acc
  }, {})

  const cases = Object.values(groupedCases || {})

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Contemporary Case Quizzes</h1>
        <Link href="/admin/case-quizzes/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Add Case Quiz
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border border-border">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <form>
            <Input
              name="q"
              placeholder="Search by case name or number..."
              className="pl-9"
              defaultValue={query}
            />
          </form>
        </div>
      </div>

      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Case Number</TableHead>
              <TableHead>Case Name</TableHead>
              <TableHead className="text-center">Questions</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cases.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No case quizzes found.
                </TableCell>
              </TableRow>
            ) : (
              cases.map((c: any) => (
                <TableRow key={c.case_number}>
                  <TableCell className="font-medium font-mono">
                    {c.case_number}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{c.case_name}</div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary">
                      {c.question_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/case-quizzes/${c.case_number}`}>
                        <Button variant="ghost" size="sm">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </Link>
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
