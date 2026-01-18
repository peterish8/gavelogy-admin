'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { EditorPanel } from '@/components/course/editor-panel'

interface NoteData {
  id: string
  title: string
  course_id: string
  courses: {
    id: string
    name: string
    icon: string
  }
}

export default function NoteEditPage() {
  const params = useParams()
  const itemId = params.itemId as string
  
  const [noteData, setNoteData] = useState<NoteData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchNote = async () => {
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
          setNoteData({
            id: data.id,
            title: data.title,
            course_id: data.course_id,
            courses: data.courses as any
          })
        }
      } catch (err) {
        console.error('Error fetching note:', err)
        setError('Failed to load note')
      } finally {
        setIsLoading(false)
      }
    }

    if (itemId) {
      fetchNote()
    }
  }, [itemId])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !noteData) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <p className="text-destructive mb-4">{error || 'Note not found'}</p>
        <Link href="/admin/notes">
          <Button variant="outline">Back to Notes</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col w-full">
      {/* Header */}
      <div className="flex items-center gap-4 shrink-0 mb-4 px-4">
        <Link href="/admin/notes">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
            {noteData.courses?.icon || '📚'}
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">{noteData.title}</h1>
            <p className="text-sm text-muted-foreground">
              {noteData.courses?.name} • Editing Note
            </p>
          </div>
        </div>
      </div>

      {/* Editor Panel - Notes Only Mode - Takes full width */}
      <div className="flex-1 min-h-0 px-4">
        <EditorPanel
          itemId={itemId}
          itemType="file"
          courseId={noteData.course_id}
          title={noteData.title}
          mode="notes-only"
        />
      </div>
    </div>
  )
}
