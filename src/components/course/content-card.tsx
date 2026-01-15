'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { FileText, HelpCircle, BookOpen, LightbulbIcon, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminControls, DragHandle } from '@/components/admin/admin-controls'
import { InlineEditor } from '@/components/admin/inline-editor'
import type { ContentItem } from '@/types/course-builder'

const contentTypeConfig = {
  note: {
    icon: FileText,
    label: 'Note',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10'
  },
  quiz: {
    icon: HelpCircle,
    label: 'Quiz',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10'
  },
  case_note: {
    icon: BookOpen,
    label: 'Case Note',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10'
  },
  interactive: {
    icon: LightbulbIcon,
    label: 'Interactive',
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10'
  }
}

interface ContentCardProps {
  content: ContentItem
  courseId: string
  subjectId: string
  isAdmin: boolean
  onEdit?: (id: string, updates: Partial<ContentItem>) => void
  onDelete?: (id: string) => void
  onClick?: () => void
}

export function ContentCard({
  content,
  courseId,
  subjectId,
  isAdmin,
  onEdit,
  onDelete,
  onClick
}: ContentCardProps) {
  const [isEditing, setIsEditing] = useState(false)

  const config = contentTypeConfig[content.content_type]
  const Icon = config.icon

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: content.id,
    disabled: !isAdmin
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  // Generate the appropriate link based on content type
  const getContentLink = () => {
    const basePath = `/admin/studio/${courseId}/${subjectId}`
    switch (content.content_type) {
      case 'note':
        return `${basePath}/notes/${content.id}`
      case 'quiz':
        return `${basePath}/quiz/${content.id}`
      case 'case_note':
        return `${basePath}/case/${content.case_number}`
      default:
        return `${basePath}/content/${content.id}`
    }
  }

  const CardContent = (
    <div className="flex items-center gap-3 p-3">
      {/* Admin drag handle */}
      {isAdmin && (
        <DragHandle
          listeners={listeners}
          attributes={attributes}
          className="opacity-0 group-hover:opacity-100 transition-opacity"
        />
      )}

      {/* Content type icon */}
      <div className={cn('shrink-0 w-9 h-9 rounded-md flex items-center justify-center', config.bgColor)}>
        <Icon className={cn('w-4.5 h-4.5', config.color)} />
      </div>

      {/* Content info */}
      <div className="flex-1 min-w-0">
        {isAdmin && isEditing ? (
          <InlineEditor
            value={content.title}
            onSave={(value) => {
              onEdit?.(content.id, { title: value })
              setIsEditing(false)
            }}
            onCancel={() => setIsEditing(false)}
            className="font-medium text-sm"
          />
        ) : (
          <h5 className="font-medium text-sm text-foreground truncate">
            {content.title}
          </h5>
        )}
        
        <p className="text-xs text-muted-foreground mt-0.5">
          {config.label}
          {content.case_number && ` • ${content.case_number}`}
        </p>
      </div>

      {/* Status & arrow */}
      <div className="flex items-center gap-2">
        {!content.is_active && (
          <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-600 rounded text-xs">
            Draft
          </span>
        )}
        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
      </div>
    </div>
  )

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group relative bg-card border border-border rounded-md overflow-hidden transition-all duration-200',
        'hover:shadow-sm hover:border-primary/20',
        isDragging && 'opacity-50 shadow-lg scale-[1.01] ring-2 ring-primary'
      )}
    >
      {onClick ? (
        <div onClick={onClick} className="cursor-pointer">
          {CardContent}
        </div>
      ) : (
        <Link href={getContentLink()}>
          {CardContent}
        </Link>
      )}

      {/* Admin controls overlay */}
      {isAdmin && (
        <AdminControls
          onEdit={() => setIsEditing(true)}
          onDelete={() => onDelete?.(content.id)}
          showDragHandle={false}
        />
      )}
    </div>
  )
}

// List wrapper for multiple content items
interface ContentListProps {
  items: ContentItem[]
  courseId: string
  subjectId: string
  isAdmin: boolean
  onEdit?: (id: string, updates: Partial<ContentItem>) => void
  onDelete?: (id: string) => void
  emptyMessage?: string
}

export function ContentList({
  items,
  courseId,
  subjectId,
  isAdmin,
  onEdit,
  onDelete,
  emptyMessage = 'No content yet'
}: ContentListProps) {
  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <p>{emptyMessage}</p>
        {isAdmin && (
          <p className="text-sm mt-1">Click the + button to add content</p>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <ContentCard
          key={item.id}
          content={item}
          courseId={courseId}
          subjectId={subjectId}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
