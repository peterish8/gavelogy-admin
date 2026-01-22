'use client'

import { useState, useEffect } from 'react'
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
import { Plus, Loader2, ArrowLeft, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAdmin } from '@/contexts/admin-context'
import { useCourses, useCourseActions } from '@/hooks/use-courses'
import { CourseCard } from '@/components/course/course-card'
import { NewCourseDeclarationModal } from '@/components/course/new-course-declaration-modal'
import { CrashCourseModal } from '@/components/course/crash-course-modal'
import { useDraftStore } from '@/lib/stores/draft-store'

export default function StudioPage() {
  const { isAdmin, isLoading: adminLoading } = useAdmin()
  const { courses, isLoading, error, refetch } = useCourses()
  const { createCourse, updateCourse, deleteCourse, reorderCourse } = useCourseActions()
  const addChange = useDraftStore((state) => state.addChange)
  
  // Local state for optimistic reordering
  const [localCourses, setLocalCourses] = useState(courses)
  
  // Update local courses when fetched courses change
  useEffect(() => {
    console.log('StudioPage: updating localCourses from courses', courses?.length)
    if (courses) {
      setLocalCourses(courses)
    }
  }, [courses])

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
      const oldIndex = localCourses.findIndex((c) => c.id === active.id)
      const newIndex = localCourses.findIndex((c) => c.id === over.id)

      // Optimistic update
      const newCourses = arrayMove(localCourses, oldIndex, newIndex)
      setLocalCourses(newCourses)

      // Add reorder change to draft
      reorderCourse(active.id as string, newIndex, oldIndex)
    }
  }

  const handleCreateCourse = () => {
    const newId = createCourse({
      name: 'New Course',
      description: 'Course description',
      icon: '📚',
      order_index: localCourses.length
    })
    // Optimistically add to local state
    setLocalCourses((prev) => [
      ...prev,
      {
        id: newId,
        name: 'New Course',
        description: 'Course description',
        icon: '📚',
        order_index: prev.length,
        price: 0,
        is_active: true,
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ])
  }

  const handleDeleteCourse = (id: string) => {
    if (confirm('Delete this course? This action will be saved when you click "Save Changes".')) {
      deleteCourse(id)
      // Optimistically remove from local state
      setLocalCourses((prev) => prev.filter((c) => c.id !== id))
    }
  }

  const handleEditCourse = (id: string, updates: Partial<typeof courses[0]>) => {
    if (Object.keys(updates).length > 0) {
      updateCourse(id, updates)
      // Optimistically update local state
      setLocalCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)))
    }
  }

  if (adminLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        <span className="sr-only">Loading...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <p className="text-destructive mb-4">{error}</p>
        <Button onClick={refetch} variant="outline">
          Try Again
        </Button>
      </div>
    )
  }

  // Safety check for courses
  const safeCourses = courses || []
  const safeLocalCourses = localCourses || []
  const displayCourses = safeLocalCourses.length > 0 ? safeLocalCourses : safeCourses

  console.log('StudioPage rendering', { 
    coursesCount: safeCourses.length, 
    localCoursesCount: safeLocalCourses.length,
    displayCount: displayCourses.length 
  })

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/50 pb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-xl">
               <Sparkles className="w-6 h-6 text-primary" />
            </div>
            Course Studio
          </h1>
          <p className="text-slate-500 mt-2 text-lg">
            Manage your course worlds and content structure
          </p>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <NewCourseDeclarationModal 
              coursesCount={displayCourses.length}
              onComplete={refetch}
            />
            <CrashCourseModal 
              coursesCount={displayCourses.length}
              onImportComplete={refetch}
            />
            <Button onClick={handleCreateCourse} className="h-11 px-6 shadow-md shadow-primary/20">
              <Plus className="w-5 h-5 mr-2" />
              New Course
            </Button>
          </div>
        )}
      </div>

      {/* Admin notice */}
      {isAdmin && (
        <div className="p-4 bg-blue-50/50 border border-blue-100/50 rounded-xl flex items-center gap-3 text-blue-700">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          <p className="text-sm font-medium">
             Drag cards to reorder. Changes are saved when you click "Save Changes" in the bottom bar.
          </p>
        </div>
      )}

      {/* Courses grid */}
      {displayCourses.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-border/60">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">No courses yet</h3>
          <p className="text-slate-500 mb-8 max-w-sm mx-auto">
            Get started by creating your first course world. It will appear here.
          </p>
          {isAdmin && (
            <Button onClick={handleCreateCourse} size="lg" variant="outline" className="border-slate-300 text-slate-700">
              <Plus className="w-5 h-5 mr-2" />
              Create First Course
            </Button>
          )}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayCourses.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {displayCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  isAdmin={isAdmin}
                  onEdit={handleEditCourse}
                  onDelete={handleDeleteCourse}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  )
}
