'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

interface InlineEditorProps {
  value: string
  onSave: (value: string) => void
  onCancel?: () => void
  placeholder?: string
  className?: string
  inputClassName?: string
  isEditing?: boolean
  onEditingChange?: (editing: boolean) => void
  multiline?: boolean
  maxLength?: number
  autoFocus?: boolean
}

export function InlineEditor({
  value,
  onSave,
  onCancel,
  placeholder = 'Enter text...',
  className,
  inputClassName,
  isEditing: controlledEditing,
  onEditingChange,
  multiline = false,
  maxLength = 200,
  autoFocus
}: InlineEditorProps) {
  const [internalEditing, setInternalEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  // Support both controlled and uncontrolled editing state
  const isEditing = controlledEditing !== undefined ? controlledEditing : internalEditing
  const setEditing = (editing: boolean) => {
    if (controlledEditing === undefined) {
      setInternalEditing(editing)
    }
    onEditingChange?.(editing)
  }

  useEffect(() => {
    if (isEditing && inputRef.current) {
      // Small timeout to ensure DOM is ready and transition is complete
      const timer = setTimeout(() => {
        if (inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [isEditing])

  useEffect(() => {
    setEditValue(value)
  }, [value])

  const containerRef = useRef<HTMLDivElement>(null)

  const handleSave = () => {
    const trimmedValue = editValue.trim()
    if (trimmedValue && trimmedValue !== value) {
      onSave(trimmedValue)
    } else {
      // If no change, treat as cancel/close
      onCancel?.()
    }
    setEditing(false)
  }

  const handleCancel = () => {
    setEditValue(value)
    setEditing(false)
    onCancel?.()
  }

  const handleBlur = (e: React.FocusEvent) => {
    // Check if the new focus is within our container (e.g. Save/Cancel buttons)
    if (containerRef.current?.contains(e.relatedTarget as Node)) {
      return
    }
    handleSave()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  if (!isEditing) {
    return (
      <span
        className={cn(
          'cursor-pointer hover:bg-muted/50 px-1 -mx-1 rounded transition-colors',
          className
        )}
        onClick={() => setEditing(true)}
        title="Click to edit"
      >
        {value || <span className="text-muted-foreground italic">{placeholder}</span>}
      </span>
    )
  }

  return (
    <div ref={containerRef} className={cn('flex items-center gap-1', className)}>
      {multiline ? (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={cn(
            'flex-1 px-2 py-1 text-sm border rounded-md bg-background resize-none',
            'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            inputClassName
          )}
          rows={3}
          autoFocus={autoFocus} 
        />
      ) : (
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value.slice(0, maxLength))}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder={placeholder}
          className={cn('flex-1 h-7 text-sm', inputClassName)}
          autoFocus={autoFocus}
        />
      )}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-green-600 hover:text-green-700 hover:bg-green-100"
          onClick={handleSave}
          type="button" // Prevent form submission if any
        >
          <Check className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          onClick={handleCancel}
          type="button"
        >
          <X className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}
