'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, FileText, HelpCircle, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminControls, DragHandle } from '@/components/admin/admin-controls'
import { InlineEditor } from '@/components/admin/inline-editor'
import type { Subject } from '@/types/course-builder'

interface SubjectCardProps {
  subject: Subject
  courseId: string
  isAdmin: boolean
  onEdit?: (id: string, updates: Partial<Subject>) => void
  onDelete?: (id: string) => void
}

export function SubjectCard({ subject, courseId, isAdmin, onEdit, onDelete }: SubjectCardProps) {
  const [isEditing, setIsEditing] = useState(false)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: subject.id,
    disabled: !isAdmin
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  // Deterministic color for icon
  const colorClass = ['blue', 'green', 'pink', 'amber'][(subject.order_index || 0) % 4]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative bg-card border border-border rounded-xl transition-all duration-200',
        'hover:shadow-md hover:border-primary/20 hover:-translate-y-0.5',
        isDragging && 'opacity-50 shadow-lg scale-[1.01] ring-2 ring-primary z-50'
      )}
    >
      <Link
        href={`/admin/studio/${courseId}/${subject.id}`}
        className="block p-4"
      >
        <div className="flex items-center gap-4">
          {/* Admin drag handle */}
          {isAdmin && (
            <DragHandle
              listeners={listeners}
              attributes={attributes}
              className="opacity-0 group-hover:opacity-100 transition-opacity absolute left-2"
            />
          )}

          {/* Subject icon with world styling */}
          <div className={cn(
            "shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-transform group-hover:scale-105",
            isAdmin ? "ml-4" : "" // Add margin for drag handle space
          )}
          style={{ 
            background: `var(--highlight-${colorClass === 'blue' ? 'blue' : colorClass === 'green' ? 'green' : colorClass === 'pink' ? 'pink' : 'orange'})` 
          }}>
            {subject.icon || '📖'}
          </div>

          {/* Subject info */}
          <div className="flex-1 min-w-0">
            {isAdmin && isEditing ? (
              <InlineEditor
                value={subject.name}
                onSave={(value) => {
                  onEdit?.(subject.id, { name: value })
                  setIsEditing(false)
                }}
                onCancel={() => setIsEditing(false)}
                className="font-bold text-lg"
              />
            ) : (
              <h4 className="font-bold text-lg text-foreground truncate group-hover:text-primary transition-colors">
                {subject.name}
              </h4>
            )}
            
            {subject.description && (
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                {subject.description}
              </p>
            )}
          </div>

          {/* Status badges */}
          <div className="flex items-center gap-3">
             <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary px-2 py-1 rounded-md">
                <FileText className="w-3.5 h-3.5" />
                <span>Module {subject.order_index + 1}</span>
             </div>

            {!subject.is_active && (
              <span className="px-2 py-1 bg-amber-500/10 text-amber-600 rounded-md text-xs font-medium">
                Draft
              </span>
            )}
            <ChevronRight className="w-5 h-5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
          </div>
        </div>
      </Link>

      {/* Admin controls overlay */}
      {isAdmin && (
        <AdminControls
          onEdit={() => setIsEditing(true)}
          onDelete={() => onDelete?.(subject.id)}
          showDragHandle={false}
          className="mr-2"
        />
      )}
    </div>
  )
}

// List wrapper for multiple subjects with drag-drop
interface SubjectListProps {
  subjects: Subject[]
  courseId: string
  isAdmin: boolean
  onEdit?: (id: string, updates: Partial<Subject>) => void
  onDelete?: (id: string) => void
  emptyMessage?: string
}

export function SubjectList({
  subjects,
  courseId,
  isAdmin,
  onEdit,
  onDelete,
  emptyMessage = 'No modules yet'
}: SubjectListProps) {
  if (subjects.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>{emptyMessage}</p>
        {isAdmin && (
          <p className="text-sm mt-1">Click "Add Module" to get started</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {subjects.map((subject) => (
        <SubjectCard
          key={subject.id}
          subject={subject}
          courseId={courseId}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
