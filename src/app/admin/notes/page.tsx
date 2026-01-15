import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { CaseListView, CaseItem } from '@/components/admin/case-list-view'

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  const query = (await searchParams).q || ''

  // 1. Fetch Notes
  let notesQuery = supabase
    .from('contemprory_case_notes')
    .select('case_number, overall_content')

  // 2. Fetch Quizzes (to get names)
  let quizzesQuery = supabase
    .from('contemporary_case_quizzes')
    .select('case_number, case_name')

  const [notesRes, quizzesRes] = await Promise.all([notesQuery, quizzesQuery])
  
  const notes = notesRes.data || []
  const quizzes = quizzesRes.data || []

  // 3. Merge Data
  // Create a map of unique case numbers
  const caseMap = new Map<string, CaseItem>()

  // Process Notes
  notes.forEach(note => {
    if (!caseMap.has(note.case_number)) {
      caseMap.set(note.case_number, {
        case_number: note.case_number,
        case_name: note.case_number, // Default to number if no name found
        has_notes: true,
        has_quiz: false,
        year: extractYear(note.case_number)
      })
    } else {
        const item = caseMap.get(note.case_number)!
        item.has_notes = true
    }
  })

  // Process Quizzes
  quizzes.forEach(quiz => {
    if (!caseMap.has(quiz.case_number)) {
       caseMap.set(quiz.case_number, {
        case_number: quiz.case_number,
        case_name: quiz.case_name || quiz.case_number,
        has_notes: false,
        has_quiz: true,
        year: extractYear(quiz.case_number) || extractYear(quiz.case_name || '')
      })
    } else {
        const item = caseMap.get(quiz.case_number)!
        item.has_quiz = true
        if (quiz.case_name) item.case_name = quiz.case_name // Upgrade name if available
    }
  })

  let allCases = Array.from(caseMap.values())

  // Filter if query exists
  if (query) {
    const lowerQ = query.toLowerCase()
    allCases = allCases.filter(c => 
        c.case_number.toLowerCase().includes(lowerQ) || 
        (c.case_name && c.case_name.toLowerCase().includes(lowerQ))
    )
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
            <h1 className="text-3xl font-bold text-foreground tracking-tight">Case Notes</h1>
            <p className="text-muted-foreground mt-1">Manage case summaries and quizzes</p>
        </div>
        <Link href="/admin/notes/new">
          <Button className="h-11 px-6 shadow-md shadow-primary/20 rounded-xl">
            <Plus className="w-5 h-5 mr-2" />
            Create Note
          </Button>
        </Link>
      </div>

      <CaseListView cases={allCases} />
    </div>
  )
}

function extractYear(text: string): string {
  if (!text) return 'Unknown'
  // Look for 4 digits starting with 19 or 20
  const match = text.match(/(19|20)\d{2}/)
  return match ? match[0] : 'Unknown'
}
