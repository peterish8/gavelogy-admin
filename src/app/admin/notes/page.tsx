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
import { Plus, Search, Edit, Trash2 } from 'lucide-react'

export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  const query = (await searchParams).q || ''

  let notesQuery = supabase
    .from('contemprory_case_notes')
    .select('*')
    .order('case_number', { ascending: false })

  if (query) {
    notesQuery = notesQuery.ilike('case_number', `%${query}%`)
  }

  const { data: notes, error } = await notesQuery

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-foreground">Case Notes</h1>
        <Link href="/admin/notes/new">
          <Button className="gap-2">
            <Plus className="w-4 h-4" />
            Create Note
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-4 bg-card p-4 rounded-lg border border-border">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <form>
            <Input
              name="q"
              placeholder="Search by case number..."
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
              <TableHead>Content Preview</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {notes?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  No notes found.
                </TableCell>
              </TableRow>
            ) : (
              notes?.map((note) => (
                <TableRow key={note.case_number}>
                  <TableCell className="font-medium">{note.case_number}</TableCell>
                  <TableCell className="max-w-md truncate text-muted-foreground">
                    <div 
                      className="truncate" 
                      dangerouslySetInnerHTML={{ 
                        __html: note.overall_content?.replace(/<[^>]*>?/gm, '').substring(0, 100) + '...' 
                      }} 
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link href={`/admin/notes/${note.case_number}/edit`}>
                        <Button variant="ghost" size="sm">
                          <Edit className="w-4 h-4" />
                        </Button>
                      </Link>
                      {/* Delete button will be a client component */}
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
