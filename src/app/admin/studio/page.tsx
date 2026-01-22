'use client'

import { useState, useEffect, useRef, useMemo } from 'react'

import { 
  Filter as FilterIcon, 
  ArrowUpDown, 
  Calendar,
  Layers
} from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
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
import { useHeaderStore } from '@/lib/stores/header-store'

export default function StudioPage() {
  const { isAdmin, isLoading: adminLoading } = useAdmin()
  const { courses, isLoading, isFetching, error, refetch } = useCourses()
  
  // Organization State
  const [filterType, setFilterType] = useState<'all' | 'normal' | 'crash'>('all')
  const [sortOrder, setSortOrder] = useState<'custom' | 'newest' | 'oldest'>('custom')

  const { createCourse, updateCourse, deleteCourse, reorderCourse } = useCourseActions()
  const addChange = useDraftStore((state) => state.addChange)
  
  // Local state for optimistic reordering
  const [localCourses, setLocalCourses] = useState(courses)
  
  // Update local courses when fetched courses change
  useEffect(() => {
    // console.log('StudioPage: updating localCourses from courses', courses?.length)
    if (courses) {
      setLocalCourses(courses)
    }
  }, [courses])

  // Auto-scroll logic
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(0)
  
  useEffect(() => {
     if (localCourses.length > prevCountRef.current && localCourses.length > 0) {
          console.log('StudioPage: Course count increased, scrolling...', localCourses.length)
          setTimeout(() => {
              bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }, 100)
          setTimeout(() => {
              bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }, 500)
      }
      prevCountRef.current = localCourses.length
  }, [localCourses.length])

  // DND Sensors
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

  const handleRefresh = () => {
      refetch()
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = localCourses.findIndex((c) => c.id === active.id)
      const newIndex = localCourses.findIndex((c) => c.id === over.id)

      // Optimistic update
      const newCourses = arrayMove(localCourses, oldIndex, newIndex)
      setLocalCourses(newCourses)

      // Add reorder change to draft (now direct save)
      reorderCourse(active.id as string, newIndex)
    }
  }

  const handleCreateCourse = async () => {
    try {
      const supabase = createClient()
      const newCourseId = crypto.randomUUID()
      
      const newCourse = {
        id: newCourseId,
        name: 'New Course',
        description: 'Course description',
        icon: '📚',
        order_index: localCourses.length,
        price: 0,
        is_active: false, // Default to hidden
        version: 1,
        is_crash_course: false, // Default normal
        updated_at: new Date().toISOString()
      }

      // Optimistically add to local state
      setLocalCourses((prev) => [
        ...prev,
        {
            ...newCourse,
            created_at: new Date().toISOString(),
        }
      ])

      const { data, error } = await supabase
        .from('courses')
        .insert(newCourse)
        .select()
        .single()

      if (error) throw error

      toast.success('Course created')
      refetch() // Sync 
      
    } catch (error: any) {
      console.error('Error creating course:', error)
      toast.error('Failed to create course: ' + (error.message || 'Unknown error'))
      refetch() // Revert 
    }
  }

  const handleDeleteCourse = async (id: string) => {
    if (confirm('Are you sure you want to delete this course? This action cannot be undone.')) {
      try {
        const supabase = createClient()
        setLocalCourses((prev) => prev.filter((c) => c.id !== id))
        const { error } = await supabase.from('courses').delete().eq('id', id)
        if (error) throw error
        toast.success('Course deleted')
        refetch() 
      } catch (error: any) {
        console.error('Error deleting course:', error)
        toast.error('Failed to delete course')
        refetch() 
      }
    }
  }

  const handleEditCourse = (id: string, updates: Partial<typeof courses[0]>) => {
    if (Object.keys(updates).length > 0) {
      updateCourse(id, updates)
      setLocalCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)))
    }
  }

  // Derived Courses Logic
  const processedCourses = useMemo(() => {
    let result = [...localCourses]

    // 1. Filter
    if (filterType === 'normal') {
      result = result.filter(c => !c.is_crash_course)
    } else if (filterType === 'crash') {
      result = result.filter(c => c.is_crash_course)
    }

    // 2. Sort
    if (sortOrder === 'newest') {
      result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    } else if (sortOrder === 'oldest') {
      result.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    } 
    // 'custom' uses the order in localCourses (already sorted by order_index usually)
    
    return result
  }, [localCourses, filterType, sortOrder])
  
  const isDndEnabled = sortOrder === 'custom' && filterType === 'all'

  
  const displayCourses = processedCourses

  // Header Integration
  const setHeader = useHeaderStore(state => state.setHeader)
  const clearHeader = useHeaderStore(state => state.clearHeader)

  useEffect(() => {
    const headerActions = isAdmin ? (
      <div className="flex items-center gap-2">
        <NewCourseDeclarationModal 
          coursesCount={displayCourses.length}
          onComplete={handleRefresh}
        />
        <CrashCourseModal 
          coursesCount={displayCourses.length}
          onImportComplete={handleRefresh}
        />
        <Button onClick={handleCreateCourse} className="h-11 px-6 shadow-md shadow-primary/20">
          <Plus className="w-5 h-5 mr-2" />
          New Course
        </Button>
      </div>
    ) : null

    setHeader('Course Studio', headerActions)
    return () => clearHeader()
  }, [isAdmin, displayCourses.length, handleRefresh, handleCreateCourse, setHeader, clearHeader])

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
        <Button onClick={handleRefresh} variant="outline">
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-32">
      {/* Page Toolbar (Filter & Sort) */}
      <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-slate-500 text-sm">
                Manage your course worlds and content structure
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-border shrink-0 shadow-sm">
                  <FilterIcon className="w-4 h-4 text-slate-400 ml-2" />
                  <Select value={filterType} onValueChange={(v: any) => setFilterType(v)}>
                      <SelectTrigger className="w-[140px] border-none shadow-none h-8 font-medium">
                          <SelectValue placeholder="Filter" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="all">All Courses</SelectItem>
                          <SelectItem value="normal">Normal Only</SelectItem>
                          <SelectItem value="crash">Crash Courses</SelectItem>
                      </SelectContent>
                  </Select>
              </div>

              <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-border shrink-0 shadow-sm">
                  <ArrowUpDown className="w-4 h-4 text-slate-400 ml-2" />
                  <Select value={sortOrder} onValueChange={(v: any) => setSortOrder(v)}>
                      <SelectTrigger className="w-[140px] border-none shadow-none h-8 font-medium">
                          <SelectValue placeholder="Sort" />
                      </SelectTrigger>
                      <SelectContent>
                          <SelectItem value="custom">Custom Order</SelectItem>
                          <SelectItem value="newest">Newest First</SelectItem>
                          <SelectItem value="oldest">Oldest First</SelectItem>
                      </SelectContent>
                  </Select>
              </div>
              
              {!isDndEnabled && (
                  <div className="text-xs text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full font-medium flex items-center gap-1.5 animate-in fade-in slide-in-from-left-2">
                      <Layers className="w-3 h-3" />
                      Reordering disabled
                  </div>
              )}

              {isFetching && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-wider animate-pulse ml-auto">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                  Syncing
                </div>
              )}
          </div>
      </div>


      {/* Admin notice */}
      {isAdmin && isDndEnabled && (
        <div className="p-4 bg-blue-50/50 border border-blue-100/50 rounded-xl flex items-center gap-3 text-blue-700">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          <p className="text-sm font-medium">
             Drag cards to reorder.
          </p>
        </div>
      )}

      {/* Courses grid */}
      {displayCourses.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-3xl border border-dashed border-border/60">
          <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">No courses found</h3>
          <p className="text-slate-500 mb-8 max-w-sm mx-auto">
             {filterType === 'all' 
                ? "Get started by creating your first course world. It will appear here."
                : "Try adjusting your filters to see more results."}
          </p>
          {isAdmin && filterType === 'all' && (
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
            disabled={!isDndEnabled} 
          >
            <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {displayCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  isAdmin={isAdmin}
                  onEdit={handleEditCourse}
                  onDelete={handleDeleteCourse}
                  // Maybe pass drag handle prop if needed to hide visual handles?
                  // For now, SortableContext disable prevents drag.
                />
              ))}
            </div>
          </SortableContext>
          {isDndEnabled && <div ref={bottomRef} className="w-full h-1" />}
        </DndContext>
      )}
    </div>
  )
}
