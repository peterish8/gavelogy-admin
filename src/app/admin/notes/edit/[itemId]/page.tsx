'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import { Button } from '@/components/ui/button'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { EditorPanel } from '@/components/course/editor-panel'

export default function NoteEditPage() {
  const params = useParams()
  const itemId = params.itemId as string

  const item = useQuery(
    api.adminQueries.getEditorData,
    itemId ? { itemId: itemId as Id<'structure_items'> } : 'skip'
  )

  if (item === undefined) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!item) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <p className="text-destructive mb-4">Note not found</p>
        <Link href="/admin/notes">
          <Button variant="outline">Back to Notes</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-140px)] flex flex-col w-full">
      <div className="flex items-center gap-4 shrink-0 mb-4 px-4">
        <Link href="/admin/notes">
          <Button variant="ghost" size="icon" className="h-9 w-9">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-lg">
            📚
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Editing Note</h1>
            <p className="text-sm text-muted-foreground">
              Editing Note
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 px-4">
        <EditorPanel
          itemId={itemId}
          itemType="file"
          courseId={''}
          title={'Editing Note'}
          mode="notes-only"
        />
      </div>
    </div>
  )
}
