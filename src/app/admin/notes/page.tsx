'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Search, FileText, Loader2, ChevronRight, Edit, FolderOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NoteItem {
  id: string
  title: string
  course_id: string
  courses: {
    id: string
    name: string
    icon: string
  }
  note_content: {
    id: string
  }[] | null
}

interface GroupedNotes {
  course: {
    id: string
    name: string
    icon: string
  }
  notes: NoteItem[]
}

export default function NotesPage() {
  const [notes, setNotes] = useState<NoteItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const supabase = createClient()
        const { data, error: fetchError } = await supabase
          .from('structure_items')
          .select(`
            id, title, course_id,
            courses(id, name, icon),
            note_content:note_contents(id)
          `)
          .eq('item_type', 'file')
          .order('course_id')
          .order('order_index')

        if (fetchError) throw fetchError
        
        // Transform the data - Supabase returns courses as object, not array
        const transformedData = (data || []).map((item: any) => ({
          id: item.id,
          title: item.title,
          course_id: item.course_id,
          courses: item.courses,
          note_content: item.note_content
        }))
        setNotes(transformedData)
      } catch (err) {
        console.error('Error fetching notes:', err)
        setError('Failed to load notes')
      } finally {
        setIsLoading(false)
      }
    }

    fetchNotes()
  }, [])

  // Filter notes based on search query
  const filteredNotes = useMemo(() => {
    if (!searchQuery.trim()) return notes
    const query = searchQuery.toLowerCase()
    return notes.filter(note => 
      note.title.toLowerCase().includes(query) ||
      note.courses?.name?.toLowerCase().includes(query)
    )
  }, [notes, searchQuery])

  // Group notes by course
  const groupedNotes = useMemo(() => {
    const groups: Map<string, GroupedNotes> = new Map()
    
    filteredNotes.forEach(note => {
      if (!note.courses) return
      
      const courseId = note.course_id
      if (!groups.has(courseId)) {
        groups.set(courseId, {
          course: note.courses,
          notes: []
        })
      }
      groups.get(courseId)!.notes.push(note)
    })

    return Array.from(groups.values())
  }, [filteredNotes])

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
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Notes</h1>
          <p className="text-muted-foreground mt-1">All notes across all courses</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-card p-4 rounded-lg border border-border">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search notes by title or course..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Notes List Grouped by Course */}
      {groupedNotes.length === 0 ? (
        <div className="text-center py-16 bg-card rounded-xl border border-border">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground/30" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-1">No notes found</h3>
          <p className="text-sm text-muted-foreground">
            {searchQuery ? 'Try a different search term' : 'Create notes in Course Studio'}
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
                {group.notes.map((note) => (
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
