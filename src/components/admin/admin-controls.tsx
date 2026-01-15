'use client'

import { GripVertical, Pencil, Trash2, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface AdminControlsProps {
  onEdit?: () => void
  onDelete?: () => void
  onDuplicate?: () => void
  showDragHandle?: boolean
  variant?: 'overlay' | 'inline'
  className?: string
}

export function AdminControls({
  onEdit,
  onDelete,
  onDuplicate,
  showDragHandle = true,
  variant = 'overlay',
  className
}: AdminControlsProps) {
  const isOverlay = variant === 'overlay'

  return (
    <div
      className={cn(
        'flex items-center gap-1',
        isOverlay && 'absolute right-2 top-2 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 backdrop-blur-sm rounded-md border border-border p-1 shadow-sm',
        !isOverlay && 'shrink-0',
        className
      )}
    >
      {showDragHandle && (
        <div
          className="cursor-grab active:cursor-grabbing p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
          title="Drag to reorder"
        >
          <GripVertical className="w-4 h-4" />
        </div>
      )}
      
      {onEdit && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onEdit()
          }}
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      )}

      {onDuplicate && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onDuplicate()
          }}
          title="Duplicate"
        >
          <Copy className="w-3.5 h-3.5" />
        </Button>
      )}

      {onDelete && (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation()
            e.preventDefault()
            onDelete()
          }}
          title="Delete"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  )
}

// Drag handle component for use with @dnd-kit
interface DragHandleProps {
  listeners?: React.HTMLAttributes<HTMLDivElement>
  attributes?: React.HTMLAttributes<HTMLDivElement>
  className?: string
}

export function DragHandle({ listeners, attributes, className }: DragHandleProps) {
  return (
    <div
      className={cn(
        'cursor-grab active:cursor-grabbing p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors touch-none',
        className
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="w-4 h-4" />
    </div>
  )
}
