import Link from 'next/link'
import { Input } from '@/components/ui/input'
import { Search, FileText, ChevronRight, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fetchQuery } from 'convex/nextjs'
import { api } from '@convex/_generated/api'

interface NoteItem {
  id: string
  title: string
  course_id: string | null | undefined
  courses: {
    id: string
    name: string
    icon?: string
  }
  note_content: { id: string }[] | null
}

interface GroupedNotes {
  course: {
    id: string
    name: string
    icon?: string
  }
  notes: NoteItem[]
}

// Server page that lists note-bearing structure items, grouped by course and filterable by search.
export default async function NotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const query = (await searchParams).q || ''
  const items = await fetchQuery(api.admin.getAllStructureItems, { item_type: 'file' })
  const notes = await Promise.all(
    items.map(async (item: any) => {
      const note = await fetchQuery(api.content.getNoteContent, { itemId: item._id })
      return {
        id: item._id,
        title: item.title,
        course_id: item.courseId,
        courses: item.course
          ? { id: item.course._id, name: item.course.name, icon: item.course.icon }
          : { id: '', name: 'Unknown Course', icon: undefined },
        note_content: note ? [{ id: note._id }] : null,
      } satisfies NoteItem
    })
  )

  // Filter by search query  
  // Applies the title/course search filter when a query is present.
  const filteredNotes = query
    ? notes.filter((note) =>
        note.title.toLowerCase().includes(query.toLowerCase()) ||
        note.courses?.name?.toLowerCase().includes(query.toLowerCase())
      )
    : notes

  // Group by course
  // Groups notes by course so the page can render one section per course.
  const groups: Map<string, GroupedNotes> = new Map()
  filteredNotes.forEach(note => {
    if (!note.courses || !note.course_id) return
    const courseId = note.course_id
    if (!groups.has(courseId)) {
      groups.set(courseId, { course: note.courses, notes: [] })
    }
    groups.get(courseId)!.notes.push(note)
  })
  const groupedNotes = Array.from(groups.values())

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Notes</h1>
          <p className="text-muted-foreground mt-1">All notes across all courses</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-card p-4 rounded-lg border border-border">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <form>
            <Input
              name="q"
              placeholder="Search notes by title or course..."
              className="pl-9"
              defaultValue={query}
            />
          </form>
        </div>
      </div>

      {/* Notes List Grouped by Course */}
      {groupedNotes.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-1">No notes found</h3>
          <p className="text-sm text-muted-foreground">
            {query ? 'Try a different search term' : 'Create notes in Course Studio'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {groupedNotes.map((group) => (
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
                  ({group.notes.length} {group.notes.length === 1 ? 'note' : 'notes'})
                </span>
              </div>

              {/* Notes Grid */}
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                {group.notes.map((note: NoteItem) => (
                  <Link
                    key={note.id}
                    href={`/admin/notes/edit/${note.id}`}
                    className={cn(
                      "group flex items-center gap-3 p-4 bg-card border border-border rounded-xl",
                      "hover:border-primary/50 hover:shadow-md transition-all duration-200"
                    )}
                  >
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                        {note.title}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {note.note_content?.length ? 'Has content' : 'Empty'}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
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
