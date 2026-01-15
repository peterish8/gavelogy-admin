'use client'

import { useState } from 'react'
import { Plus, FileText, HelpCircle, LightbulbIcon, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

type ContentType = 'note' | 'quiz' | 'interactive' | 'case_note'

interface AddContentButtonProps {
  onAdd: (type: ContentType) => void
  position?: 'between' | 'end'
  className?: string
}

export function AddContentButton({ onAdd, position = 'between', className }: AddContentButtonProps) {
  const [isHovered, setIsHovered] = useState(false)

  const isBetween = position === 'between'

  return (
    <div
      className={cn(
        'relative',
        isBetween && 'h-8 -my-2 flex items-center justify-center',
        !isBetween && 'py-4',
        className
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isBetween ? (
        // Between items - thin line with plus that expands
        <div className="relative w-full flex items-center justify-center group">
          {/* The line */}
          <div
            className={cn(
              'absolute inset-x-4 h-px bg-border transition-colors duration-200',
              isHovered && 'bg-primary/50'
            )}
          />
          
          {/* The plus button */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className={cn(
                  'relative z-10 h-6 w-6 rounded-full transition-all duration-200',
                  'border-dashed border-muted-foreground/50',
                  'opacity-0 group-hover:opacity-100',
                  'hover:border-primary hover:bg-primary hover:text-primary-foreground'
                )}
              >
                <Plus className="w-3.5 h-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <AddContentDropdown onAdd={onAdd} />
          </DropdownMenu>
        </div>
      ) : (
        // End of list - larger button
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="w-full border-dashed hover:border-primary hover:bg-primary/5"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Content
            </Button>
          </DropdownMenuTrigger>
          <AddContentDropdown onAdd={onAdd} />
        </DropdownMenu>
      )}
    </div>
  )
}

interface AddContentDropdownProps {
  onAdd: (type: ContentType) => void
}

function AddContentDropdown({ onAdd }: AddContentDropdownProps) {
  return (
    <DropdownMenuContent align="center" className="w-48">
      <DropdownMenuItem onClick={() => onAdd('note')}>
        <FileText className="w-4 h-4 mr-2 text-blue-500" />
        <div>
          <div className="font-medium">Add Note</div>
          <div className="text-xs text-muted-foreground">Rich text content</div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('quiz')}>
        <HelpCircle className="w-4 h-4 mr-2 text-purple-500" />
        <div>
          <div className="font-medium">Add Quiz</div>
          <div className="text-xs text-muted-foreground">Link existing quiz</div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('case_note')}>
        <BookOpen className="w-4 h-4 mr-2 text-orange-500" />
        <div>
          <div className="font-medium">Add Case Note</div>
          <div className="text-xs text-muted-foreground">Link case notes</div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => onAdd('interactive')}>
        <LightbulbIcon className="w-4 h-4 mr-2 text-amber-500" />
        <div>
          <div className="font-medium">Add Interactive</div>
          <div className="text-xs text-muted-foreground">Quick check questions</div>
        </div>
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

// Simple add button for courses/subjects
interface AddItemButtonProps {
  label: string
  onClick: () => void
  className?: string
}

export function AddItemButton({ label, onClick, className }: AddItemButtonProps) {
  return (
    <Button
      variant="outline"
      className={cn('w-full border-dashed hover:border-primary hover:bg-primary/5', className)}
      onClick={onClick}
    >
      <Plus className="w-4 h-4 mr-2" />
      {label}
    </Button>
  )
}
