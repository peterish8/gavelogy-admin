'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight, BookOpen, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminControls, DragHandle } from '@/components/admin/admin-controls'
import { InlineEditor } from '@/components/admin/inline-editor'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import type { Course } from '@/types/course-builder'

interface CourseCardProps {
  course: Course
  isAdmin: boolean
  onEdit?: (id: string, updates: Partial<Course>) => void
  onDelete?: (id: string) => void
}

export function CourseCard({ course, isAdmin, onEdit, onDelete }: CourseCardProps) {
  const [editingField, setEditingField] = useState<'name' | 'description' | 'icon' | null>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: course.id,
    disabled: !isAdmin || !!editingField // Disable drag when editing
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  }

  // Deterministic color assignment based on name length
  const colorIndex = course.name.length % 4
  const colorClass = ['blue', 'green', 'pink', 'amber'][colorIndex]

  const handleEditStart = (field: 'name' | 'description' | 'icon') => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setEditingField(field)
  }

  const handleEditSave = (field: 'name' | 'description' | 'icon', value: string) => {
    onEdit?.(course.id, { [field]: value })
    setEditingField(null)
  }

  const [showDisableDialog, setShowDisableDialog] = useState(false)
  const [isTogglingActive, setIsTogglingActive] = useState(false)

  const handleToggleActive = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setShowDisableDialog(true)
  }

  const confirmToggle = async () => {
    setIsTogglingActive(true)
    setShowDisableDialog(false)
    
    try {
      // Direct Supabase call - bypasses DraftStore for instant update
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      
      const { error } = await supabase
        .from('courses')
        .update({ is_active: !course.is_active })
        .eq('id', course.id)
      
      if (error) throw error
      
      // Update local state via the prop (for cache invalidation)
      onEdit?.(course.id, { is_active: !course.is_active })
    } catch (error) {
      console.error('Failed to toggle course visibility:', error)
      const { toast } = await import('sonner')
      toast.error('Failed to update course visibility')
    } finally {
      setIsTogglingActive(false)
    }
  }

  const isEnabling = !course.is_active

  const linkContent = (
    <>
      <div className="flex items-start justify-between mb-4">
        {/* Admin drag handle */}
        {isAdmin && (
          <DragHandle
            listeners={listeners}
            attributes={attributes}
            className="absolute left-4 top-4 transition-opacity z-50 text-slate-400 hover:text-slate-700"
          />
        )}

        {/* Course icon with world styling */}
        <div 
          className={cn(
            "world-icon", 
            `world-icon-${colorClass}`, 
            isAdmin && "cursor-pointer hover:ring-2 hover:ring-primary/50 relative z-20 mt-8" // Added mt-8 to clear the drag handle area
          )}
          onClick={isAdmin ? handleEditStart('icon') : undefined}
          title={isAdmin ? "Click to edit icon" : undefined}
        >
          {isAdmin && editingField === 'icon' ? (
            <div onClick={(e) => e.stopPropagation()}>
              <InlineEditor
                value={course.icon}
                onSave={(val) => handleEditSave('icon', val)}
                onCancel={() => setEditingField(null)}
                isEditing={true}
                className="w-8"
                inputClassName="w-16 text-center"
                autoFocus
              />
            </div>
          ) : (
             course.icon || '📚'
          )}
        </div>
        
        {/* Removed ChevronRight from here to avoid conflict with AdminControls top-right */}
      </div>

      {/* Course info */}
      <div className="flex-1 min-w-0 mb-4 relative z-20">
        <div onClick={isAdmin ? handleEditStart('name') : undefined}>
          {isAdmin && editingField === 'name' ? (
             <div onClick={(e) => e.stopPropagation()}>
              <InlineEditor
                value={course.name}
                onSave={(val) => handleEditSave('name', val)}
                onCancel={() => setEditingField(null)}
                isEditing={true}
                className="font-bold text-xl mb-1 block"
                inputClassName="font-bold text-xl h-auto py-1"
                autoFocus
              />
            </div>
          ) : (
            <h3 className={cn(
              "font-bold text-xl text-foreground truncate mb-1",
              isAdmin && "hover:text-primary cursor-pointer border-b border-transparent hover:border-dashed hover:border-primary/50"
            )}>
              {course.name}
            </h3>
          )}
        </div>
        
        <div onClick={isAdmin ? handleEditStart('description') : undefined}>
          {isAdmin && editingField === 'description' ? (
            <div onClick={(e) => e.stopPropagation()}>
              <InlineEditor
                value={course.description || ''}
                onSave={(val) => handleEditSave('description', val)}
                onCancel={() => setEditingField(null)}
                isEditing={true}
                multiline
                className="text-sm mt-1 w-full"
                inputClassName="text-sm min-h-[4rem]"
                autoFocus
                placeholder="Enter description..."
              />
            </div>
          ) : (
            <p className={cn(
              "text-sm text-muted-foreground line-clamp-2 min-h-10",
              isAdmin && "hover:text-foreground cursor-pointer"
            )}>
              {course.description || 'No description provided'}
            </p>
          )}
        </div>
      </div>

      {/* Stats & Status Row */}
      <div className="mt-auto pt-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground min-h-[40px]">
        <div className="flex items-center gap-2">
           {/* Maintenance Mode Toggle - Moved to Bottom Left */}
           {isAdmin && !editingField ? (
             <button
               onClick={handleToggleActive}
               className={cn(
                 "p-1.5 rounded-full transition-all border flex items-center gap-2",
                 course.is_active 
                  ? "text-green-600 bg-green-50/50 hover:bg-green-100 border-green-200" 
                  : "text-amber-600 bg-amber-50 hover:bg-amber-100 border-amber-200"
               )}
               title={course.is_active ? "Live" : "Maintenance"}
             >
               {course.is_active ? (
                 <>
                   <Eye className="w-3.5 h-3.5" />
                   <span className="text-[10px] font-medium pr-1">Live</span>
                 </>
               ) : (
                 <>
                   <EyeOff className="w-3.5 h-3.5" />
                   <span className="text-[10px] font-medium pr-1">Hidden</span>
                 </>
               )}
             </button>
           ) : (
             /* Non-admin view or editing mode */
             !course.is_active && (
                <span className="px-2 py-1 bg-amber-500/10 text-amber-600 rounded-md font-medium flex items-center gap-1.5">
                  <EyeOff className="w-3.5 h-3.5" />
                  Draft
                </span>
             )
           )}
        </div>
        
        <div className="flex items-center gap-3">
            {course.price > 0 && (
              <span className="font-semibold text-primary text-sm">
                ₹{course.price}
              </span>
            )}
            
            {/* Chevron visible on hover */}
            <ChevronRight className="w-5 h-5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
    </>
  )

  return (
    <>
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'group world-card world-card-accent overflow-hidden relative min-h-[280px]',
        isDragging && 'opacity-50 ring-2 ring-primary scale-[1.02]'
      )}
    >
      {/* If editing, don't use Link wrapper to avoid navigation issues */}
      {editingField ? (
        <div className="p-6 h-full flex flex-col pt-12">
          {linkContent}
        </div>
      ) : (
        <Link
          href={`/admin/studio/${course.id}`}
          className="p-6 h-full flex flex-col pt-12 pb-12"
        >
          {linkContent}
        </Link>
      )}

      {/* Admin controls overlay - Top Right for Edit/Delete */}
      {isAdmin && !editingField && (
        <AdminControls
          onEdit={() => setEditingField('name')}
          onDelete={() => onDelete?.(course.id)}
          showDragHandle={false}
          className="bg-white/90 shadow-sm border-0 absolute top-4 right-4 z-50"
        />
      )}
    </div>

    <AlertDialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isEnabling ? "Go Live?" : "Enable Maintenance Mode?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isEnabling ? (
              <>
                This will make <strong>{course.name}</strong> visible to all users.
                <br /><br />
                Are you sure you want to publish this course?
              </>
            ) : (
              <>
                This will hide <strong>{course.name}</strong> from all users.
                <br /><br />
                It will only be visible to admins. Are you sure?
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
          <AlertDialogAction 
            onClick={(e) => {
                e.stopPropagation()
                confirmToggle()
            }}
            className={cn(
              isEnabling 
                ? "bg-green-600 hover:bg-green-700" 
                : "bg-amber-600 hover:bg-amber-700"
            )}
          >
            {isEnabling ? "Go Live" : "Disable Course"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}

// Compact version for sidebar navigation
interface CourseNavItemProps {
  course: Course
  isActive?: boolean
  isAdmin: boolean
  onEdit?: (id: string, updates: Partial<Course>) => void
  onDelete?: (id: string) => void
}

export function CourseNavItem({ course, isActive, isAdmin, onEdit, onDelete }: CourseNavItemProps) {
  return (
    <Link
      href={`/admin/studio/${course.id}`}
      className={cn(
        'group flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      )}
    >
      <span className="text-lg">{course.icon || '📚'}</span>
      <span className="flex-1 truncate text-sm font-medium">{course.name}</span>
      
      {isAdmin && !isActive && (
        <AdminControls
          variant="inline"
          onEdit={() => onEdit?.(course.id, {})}
          onDelete={() => onDelete?.(course.id)}
          showDragHandle={false}
          className="opacity-0 group-hover:opacity-100"
        />
      )}
    </Link>
  )
}
