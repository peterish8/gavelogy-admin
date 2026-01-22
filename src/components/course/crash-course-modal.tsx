'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, PlusCircle, Check, BookOpen, AlertCircle, Search, X } from 'lucide-react'
import { useCourses } from '@/hooks/use-courses'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface CrashCourseModalProps {
  coursesCount: number
  onImportComplete: () => void
}

export function CrashCourseModal({ coursesCount, onImportComplete }: CrashCourseModalProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { courses, isLoading: coursesLoading } = useCourses()
  
  
  const [courseName, setCourseName] = useState('')
  const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [step, setStep] = useState<'name' | 'select'>('name')
  const [searchQuery, setSearchQuery] = useState('')

  // Filter out other crash courses for selection if desired, or just show all
  const filteredCourses = courses?.filter(c => {
    if (c.is_crash_course) return false
    if (!searchQuery.trim()) return true
    
    const query = searchQuery.toLowerCase()
    return (
      c.name.toLowerCase().includes(query) || 
      (c.description && c.description.toLowerCase().includes(query))
    )
  })

  const availableCourses = courses?.filter(c => !c.is_crash_course)

  const toggleCourse = (courseId: string) => {
    setSelectedCourseIds(prev => 
      prev.includes(courseId) 
        ? prev.filter(id => id !== courseId)
        : [...prev, courseId]
    )
  }

  const handleImport = async () => {
    if (selectedCourseIds.length === 0 || !courseName.trim()) return
    
    setIsImporting(true)
    const supabase = createClient()
    let toastId: string | number = ''

    try {
      toastId = toast.loading('Creating crash course...')
      const newCourseId = crypto.randomUUID()

      // 1. Create the course DIRECTLY in DB (not through draft store)
      const { error: courseError } = await supabase.from('courses').insert({
        id: newCourseId,
        name: courseName.trim(),
        description: `Crash course bundling: ${selectedCourseIds.length} modules`,
        icon: '🚀',
        is_crash_course: true,
        order_index: coursesCount,
        is_active: false  // Hidden by default, admin can make it live later
      })

      if (courseError) throw courseError

      // 2. Fetch ALL structure items for ALL selected courses in ONE query
      toast.loading('Fetching source content...', { id: toastId })
      const { data: allItems, error: itemsError } = await supabase
        .from('structure_items')
        .select('*')
        .in('course_id', selectedCourseIds)
        .order('order_index', { ascending: true })

      if (itemsError) throw itemsError
      if (!allItems || allItems.length === 0) {
        toast.success('Crash course created (no items to clone)', { id: toastId })
        onImportComplete()
        setOpen(false)
        resetState()
        router.push(`/admin/studio/${newCourseId}`)
        return
      }

      // 3. Build all new structure items in memory
      toast.loading(`Cloning ${allItems.length} items...`, { id: toastId })
      const newItems: any[] = []

      // Group by course_id
      const itemsByCourse = allItems.reduce((acc: any, item: any) => {
        if (!acc[item.course_id]) acc[item.course_id] = []
        acc[item.course_id].push(item)
        return acc
      }, {})

      let rootFolderIndex = 0
      for (const sourceCourseId of selectedCourseIds) {
        const sourceCourse = availableCourses?.find(c => c.id === sourceCourseId)
        if (!sourceCourse) continue

        const items = itemsByCourse[sourceCourseId] || []
        if (items.length === 0) continue

        // Index by parent_id for O(1) lookup
        const itemsByParent: Record<string, any[]> = {}
        items.forEach((item: any) => {
          const key = item.parent_id ?? 'null'
          if (!itemsByParent[key]) itemsByParent[key] = []
          itemsByParent[key].push(item)
        })

        // Create root folder for this course (use incrementing index)
        const rootFolderId = crypto.randomUUID()
        newItems.push({
          id: rootFolderId,
          course_id: newCourseId,
          parent_id: null,
          item_type: 'folder',
          title: sourceCourse.name,
          order_index: rootFolderIndex++
        })

        // Clone recursively using iteration (faster than recursion for large trees)
        const queue: { oldParentId: string | null; newParentId: string | null }[] = [
          { oldParentId: null, newParentId: rootFolderId }
        ]

        while (queue.length > 0) {
          const { oldParentId, newParentId } = queue.shift()!
          const parentKey = oldParentId ?? 'null'
          const children = itemsByParent[parentKey] || []

          for (const item of children) {
            const newItemId = crypto.randomUUID()
            newItems.push({
              id: newItemId,
              course_id: newCourseId,
              parent_id: newParentId,
              item_type: item.item_type,
              title: item.title,
              order_index: item.order_index // Keep original order within folders
            })

            if (item.item_type === 'folder') {
              queue.push({ oldParentId: item.id, newParentId: newItemId })
            }
          }
        }
      }

      // 4. Insert ALL items in CHUNKS (Avoid payload too large errors)
      if (newItems.length > 0) {
        const CHUNK_SIZE = 1000
        const chunks = []
        for (let i = 0; i < newItems.length; i += CHUNK_SIZE) {
          chunks.push(newItems.slice(i, i + CHUNK_SIZE))
        }

        toast.loading(`Saving ${newItems.length} items (0/${chunks.length})...`, { id: toastId })
        
        // Process chunks sequentially to maintain basic order integrity and avoid flooding DB
        for (let i = 0; i < chunks.length; i++) {
           const chunk = chunks[i]
           const { error: insertError } = await supabase
             .from('structure_items')
             .insert(chunk)
             
           if (insertError) throw insertError
           
           // Update progress
           toast.loading(`Saving ${newItems.length} items (${i + 1}/${chunks.length})...`, { id: toastId })
        }
      }

      toast.success(`Crash course created with ${newItems.length} items!`, { id: toastId })
      onImportComplete()
      setOpen(false)
      resetState()
      
      // Navigate to the new course studio
      router.push(`/admin/studio/${newCourseId}`)
      
    } catch (error: any) {
      console.error('Import error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      
      const errorMessage = error?.message || 'Failed to create crash course'
      toast.error(errorMessage, { id: toastId })
    } finally {
      setIsImporting(false)
    }
  }

  const resetState = () => {
    setCourseName('')
    setSelectedCourseIds([])
    setSearchQuery('')
    setStep('name')
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if(!o) resetState(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="default" className="gap-2 h-11 bg-linear-to-r from-blue-50 to-purple-50 hover:from-blue-100 hover:to-purple-100 border-blue-200 text-blue-700 shadow-sm">
          <BookOpen className="w-4 h-4" />
          Crash Course
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] flex flex-col max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-blue-600" />
            Create Crash Course
          </DialogTitle>
        </DialogHeader>
        
        {step === 'name' ? (
            <div className="py-6 space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="courseName">What should we call this Crash Course?</Label>
                    <Input 
                        id="courseName" 
                        placeholder="e.g. Master Law Bundle 2026" 
                        value={courseName}
                        onChange={(e) => setCourseName(e.target.value)}
                        autoFocus
                    />
                </div>
                <div className="p-3 bg-blue-50 rounded-lg space-y-2 text-xs text-blue-700 border border-blue-100">
                    <div className="flex gap-3">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <p>This will create a new course world where you can bundle structure from other courses.</p>
                    </div>
                    {selectedCourseIds.length > 0 && (
                        <div className="flex gap-3 pt-1 border-t border-blue-200/50">
                            <Check className="w-4 h-4 shrink-0 text-green-600" />
                            <p className="font-semibold text-green-700">Currently keeping {selectedCourseIds.length} course{selectedCourseIds.length !== 1 ? 's' : ''} selected.</p>
                        </div>
                    )}
                </div>
                <div className="flex justify-end pt-4">
                    <Button 
                        disabled={!courseName.trim()} 
                        onClick={() => setStep('select')}
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                        Next: Select Courses →
                    </Button>
                </div>
            </div>
        ) : (
            <div className="flex-1 overflow-hidden flex flex-col py-4">
                <div className="flex items-center justify-between mb-4 px-1 gap-4">
                    <div className="flex-1 relative group">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                        <Input 
                            placeholder="Search courses..." 
                            className="pl-9 pr-8 h-9 text-xs rounded-lg border-slate-200 focus:ring-blue-500/20"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                        {searchQuery && (
                            <button 
                                onClick={() => setSearchQuery('')}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setStep('name')} className="text-xs text-blue-600 h-7 shrink-0">
                        ← Rename
                    </Button>
                </div>
                
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 custom-scrollbar min-h-[200px]">
                    {coursesLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 gap-3">
                        <Loader2 className="w-10 h-10 animate-spin text-blue-500/50" />
                        <p className="text-sm text-muted-foreground animate-pulse">Loading available courses...</p>
                    </div>
                    ) : filteredCourses?.length === 0 ? (
                    <div className="text-center py-12 px-4 border-2 border-dashed rounded-xl">
                        <BookOpen className="w-12 h-12 mx-auto mb-3 text-slate-200" />
                        <p className="text-slate-500 font-medium">
                            {searchQuery ? `No results for "${searchQuery}"` : "No courses available to bundle"}
                        </p>
                    </div>
                    ) : (
                    filteredCourses?.map(course => {
                        const isSelected = selectedCourseIds.includes(course.id)
                        return (
                        <div 
                            key={course.id}
                            className={cn(
                            "flex items-center px-4 py-3 rounded-xl border transition-all cursor-pointer group relative overflow-hidden",
                            isSelected 
                                ? "bg-blue-50/80 border-blue-200 shadow-sm ring-1 ring-blue-100" 
                                : "bg-white hover:bg-slate-50 border-slate-200 hover:border-slate-300 shadow-sm"
                            )}
                            onClick={() => toggleCourse(course.id)}
                        >
                            {isSelected && (
                                <div className="absolute top-0 right-0 p-1">
                                    <div className="bg-blue-500 text-white rounded-bl-lg rounded-tr-lg p-0.5">
                                        <Check className="w-3 h-3" />
                                    </div>
                                </div>
                            )}

                            <div className="flex-1 flex items-center gap-3">
                            <div className={cn(
                                "w-10 h-10 rounded-lg flex items-center justify-center text-xl transition-colors",
                                isSelected ? "bg-white text-blue-600" : "bg-slate-50 text-slate-600 group-hover:bg-white"
                            )}>
                                {course.icon || '📚'}
                            </div>
                            <div className="flex flex-col min-w-0">
                                <span className={cn(
                                    "font-bold text-sm truncate",
                                    isSelected ? "text-blue-900" : "text-slate-700"
                                )}>{course.name}</span>
                                <span className="text-[11px] text-slate-400 line-clamp-1">
                                {course.description || 'No description'}
                                </span>
                            </div>
                            </div>
                        </div>
                        )
                    })
                    )}
                </div>

                <div className="flex justify-between items-center mt-6 pt-4 border-t gap-3">
                    <div className="text-xs font-medium text-slate-500">
                        {selectedCourseIds.length} course{selectedCourseIds.length !== 1 ? 's' : ''} selected
                    </div>
                    <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={isImporting}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleImport} 
                            disabled={isImporting || selectedCourseIds.length === 0}
                            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 shadow-md shadow-blue-200"
                            size="sm"
                        >
                            {isImporting ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Creating...
                            </>
                            ) : (
                            <>
                                <PlusCircle className="w-4 h-4" />
                                Create & Bundle
                            </>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
