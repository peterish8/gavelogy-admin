'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { Loader2, ArrowLeft, FileText, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAdmin } from '@/contexts/admin-context'
import { useSubject } from '@/hooks/use-subjects'
import { useContentActions } from '@/hooks/use-content'
import { ContentCard, ContentList } from '@/components/course/content-card'
import { AddContentButton } from '@/components/admin/add-button'
import type { ContentItem } from '@/types/course-builder'

export default function SubjectDetailPage() {
  const params = useParams()
  const courseId = params.courseId as string
  const subjectId = params.subjectId as string
  
  const { isAdmin, isLoading: adminLoading } = useAdmin()
  const { subject, isLoading, error, refetch } = useSubject(subjectId)
  const { createContentItem, updateContentItem, deleteContentItem, reorderContentItem } = useContentActions()
  
  // Local state for optimistic updates
  const [localContent, setLocalContent] = useState<ContentItem[]>([])

  // Sync local content with fetched data
  useEffect(() => {
    if (subject?.content_items) {
      setLocalContent(subject.content_items)
    }
  }, [subject?.content_items])

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = localContent.findIndex((c) => c.id === active.id)
      const newIndex = localContent.findIndex((c) => c.id === over.id)

      // Optimistic update
      const newContent = arrayMove(localContent, oldIndex, newIndex)
      setLocalContent(newContent)

      // Add reorder change to draft
      reorderContentItem(active.id as string, newIndex, oldIndex)
    }
  }

  const handleAddContent = (type: ContentItem['content_type']) => {
    const titles: Record<string, string> = {
      note: 'New Note',
      quiz: 'New Quiz',
      case_note: 'New Case Note',
      interactive: 'New Interactive Content'
    }
    
    const newId = createContentItem({
      subject_id: subjectId,
      content_type: type,
      title: titles[type] || 'New Content',
      order_index: localContent.length
    })
    
    // Optimistically add to local state
    setLocalContent([
      ...localContent,
      {
        id: newId,
        subject_id: subjectId,
        content_type: type,
        title: titles[type] || 'New Content',
        order_index: localContent.length,
        is_active: true,
        version: 1,
        note_content: null,
        quiz_id: null,
        case_number: null,
        interactive_data: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ])
  }

  const handleDeleteContent = (id: string) => {
    if (confirm('Delete this content? Changes are saved when you click "Save Changes".')) {
      deleteContentItem(id)
      setLocalContent(localContent.filter((c) => c.id !== id))
    }
  }

  const handleEditContent = (id: string, updates: Partial<ContentItem>) => {
    if (Object.keys(updates).length > 0) {
      updateContentItem(id, updates)
      setLocalContent(localContent.map((c) => (c.id === id ? { ...c, ...updates } : c)))
    }
  }

  if (adminLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !subject) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <p className="text-destructive mb-4">{error || 'Module not found'}</p>
        <Button onClick={refetch} variant="outline">
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/admin/studio" className="hover:text-foreground transition-colors">
            Studio
          </Link>
          <ChevronRight className="w-4 h-4" />
          <Link href={`/admin/studio/${courseId}`} className="hover:text-foreground transition-colors">
            Course
          </Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground font-medium">{subject.name}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/admin/studio/${courseId}`}>
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-secondary rounded-lg flex items-center justify-center text-xl">
              {subject.icon || '📖'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {subject.name}
              </h1>
              <p className="text-sm text-muted-foreground">
                {localContent.length} {localContent.length === 1 ? 'item' : 'items'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Subject description */}
      {subject.description && (
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-sm text-muted-foreground">{subject.description}</p>
        </div>
      )}

      {/* Admin notice */}
      {isAdmin && (
        <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
          <p className="text-sm text-primary">
            <strong>Admin Mode:</strong> Drag content to reorder. Click the + button between items to add new content.
          </p>
        </div>
      )}

      {/* Content list with drag-drop */}
      {localContent.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">No content yet</h3>
          <p className="text-muted-foreground mb-4">
            Add your first piece of content to this module
          </p>
          {isAdmin && (
            <AddContentButton
              onAdd={handleAddContent}
              position="end"
            />
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={localContent.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-1">
              {/* Add button at start */}
              {isAdmin && (
                <AddContentButton
                  onAdd={handleAddContent}
                  position="between"
                />
              )}
              
              {localContent.map((content, index) => (
                <div key={content.id}>
                  <ContentCard
                    content={content}
                    courseId={courseId}
                    subjectId={subjectId}
                    isAdmin={isAdmin}
                    onEdit={handleEditContent}
                    onDelete={handleDeleteContent}
                  />
                  
                  {/* Add button between items */}
                  {isAdmin && (
                    <AddContentButton
                      onAdd={handleAddContent}
                      position="between"
                    />
                  )}
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
