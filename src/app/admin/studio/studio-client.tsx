'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'

import { 
  Filter as FilterIcon, 
  ArrowUpDown, 
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
import { Plus, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAdmin } from '@/contexts/admin-context'
import { useCourseActions } from '@/hooks/use-courses'
import { CourseCard } from '@/components/course/course-card'
import { useAdminsByCourse } from '@/lib/realtime/realtime-provider'
import { NewCourseDeclarationModal } from '@/components/course/new-course-declaration-modal'
import { CrashCourseModal } from '@/components/course/crash-course-modal'
import { useHeaderStore } from '@/lib/stores/header-store'
import type { Course } from '@/types/course-builder'

interface StudioClientProps {
  initialCourses: Course[]
}

// Course Studio landing page: sortable/filterable course card grid with drag-reorder, create, edit, and delete actions.
export default function StudioClient({ initialCourses }: StudioClientProps) {
  const { isAdmin } = useAdmin()
  const adminsByCourse = useAdminsByCourse()

  // Organization State
  const [filterType, setFilterType] = useState<'all' | 'normal' | 'crash'>('all')
  const [sortOrder, setSortOrder] = useState<'custom' | 'newest' | 'oldest'>('custom')
  const [isFetching, setIsFetching] = useState(false)

  const { updateCourse, reorderCourse } = useCourseActions()

  
  // Use server-provided initial courses (no client-side initial fetch needed!)
  const [localCourses, setLocalCourses] = useState(initialCourses)

  // Re-fetches the full course list from Supabase to sync local state after mutations.
  const refetch = useCallback(async () => {
    setIsFetching(true)
    try {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('courses')
        .select('*')
        .order('order_index', { ascending: true })
      if (!error && data) {
        setLocalCourses(data)
      }
    } finally {
      setIsFetching(false)
    }
  }, [])

  // Scrolls to the bottom sentinel div when a new course is added, so the new card is visible.
  const bottomRef = useRef<HTMLDivElement>(null)
  const prevCountRef = useRef(initialCourses.length)

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

  // Thin wrapper so the header action button can trigger a refetch without holding a stale ref.
  const handleRefresh = useCallback(() => {
      refetch()
  }, [refetch])

  // Reorders the dragged course card and updates order_index for every displaced course in the affected range.
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = localCourses.findIndex((c) => c.id === active.id)
      const newIndex = localCourses.findIndex((c) => c.id === over.id)

      const newCourses = arrayMove(localCourses, oldIndex, newIndex)
      setLocalCourses(newCourses)

      // Update all courses in the affected range so order_index stays collision-free
      const minIdx = Math.min(oldIndex, newIndex)
      const maxIdx = Math.max(oldIndex, newIndex)
      newCourses.slice(minIdx, maxIdx + 1).forEach((c, i) =>
        reorderCourse(c.id, minIdx + i)
      )
    }
  }

  // Optimistically inserts a new blank course into local state, then persists it to Supabase; reverts on error.
  const handleCreateCourse = useCallback(async () => {
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

      const { error } = await supabase
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
  }, [localCourses.length, refetch])

  // Confirms with the user, removes the course from local state, then deletes it from Supabase; refetches on both success and error.
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

  // Optimistically applies field updates to the course card, awaits the DB write, and reverts on failure.
  const handleEditCourse = async (id: string, updates: Partial<Course>) => {
    if (Object.keys(updates).length === 0) return
    const snapshot = localCourses
    setLocalCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)))
    try {
      await updateCourse(id, updates)
    } catch {
      setLocalCourses(snapshot)
      toast.error('Failed to save course changes')
    }
  }

  // Applies the active filter (normal/crash) and sort order to produce the final display list.
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

  // Injects New Course / Crash Course / Refresh buttons into the shared page header via header-store.
  const setHeader = useHeaderStore(state => state.setHeader)
  const clearHeader = useHeaderStore(state => state.clearHeader)
  
  // Store callbacks in refs to avoid re-triggering useEffect
  const handleRefreshRef = useRef(handleRefresh)
  const handleCreateCourseRef = useRef(handleCreateCourse)
  
  useEffect(() => {
    handleRefreshRef.current = handleRefresh
    handleCreateCourseRef.current = handleCreateCourse
  })

  useEffect(() => {
    const headerActions = isAdmin ? (
      <div className="flex items-center gap-2">
        <NewCourseDeclarationModal 
          coursesCount={displayCourses.length}
          onComplete={() => handleRefreshRef.current()}
        />
        <CrashCourseModal 
          coursesCount={displayCourses.length}
          onImportComplete={() => handleRefreshRef.current()}
        />
        <Button onClick={() => handleCreateCourseRef.current()} className="h-11 px-6 shadow-md shadow-primary/20">
          <Plus className="w-5 h-5 mr-2" />
          New Course
        </Button>
      </div>
    ) : null

    setHeader('Course Studio', headerActions)
    return () => clearHeader()
  }, [isAdmin, displayCourses.length, setHeader, clearHeader])





  return (
    <div className="space-y-8 pb-32">
      {/* Page Toolbar (Filter & Sort) */}
      <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-muted-foreground text-sm">
                Manage your course worlds and content structure
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-card p-1 rounded-lg border border-border shrink-0 shadow-sm">
                  <FilterIcon className="w-4 h-4 text-muted-foreground/70 ml-2" />
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

              <div className="flex items-center gap-2 bg-card p-1 rounded-lg border border-border shrink-0 shadow-sm">
                  <ArrowUpDown className="w-4 h-4 text-muted-foreground/70 ml-2" />
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
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border/50 rounded-full text-[10px] font-bold text-muted-foreground/70 uppercase tracking-wider animate-pulse ml-auto">
                  <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
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
        <div className="text-center py-24 bg-card rounded-3xl border border-dashed border-border/60">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-10 h-10 text-muted-foreground/50" />
          </div>
          <h3 className="text-xl font-bold text-foreground mb-2">No courses found</h3>
          <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
             {filterType === 'all' 
                ? "Get started by creating your first course world. It will appear here."
                : "Try adjusting your filters to see more results."}
          </p>
          {isAdmin && filterType === 'all' && (
            <Button onClick={handleCreateCourse} size="lg" variant="outline" className="border-border text-foreground/90">
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
                  activeAdmins={adminsByCourse[course.id]}
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
