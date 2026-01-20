'use client'

import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Plus, Loader2, ArrowLeft, Settings, Folder, FileText, ChevronRight, Edit2, Maximize2, Minimize2, Copy, FileJson, FileType, MoreHorizontal, GripVertical } from 'lucide-react'
import { useEffect, useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useAdmin } from '@/contexts/admin-context'
import { useCourse } from '@/hooks/use-courses'
import { useStructure, useStructureActions } from '@/hooks/use-structure'
import { StructureTree } from '@/components/course/structure-tree'
import { EditorPanel } from '@/components/course/editor-panel'
import { CourseDeclarationModal } from '@/components/course/course-declaration-modal'
import type { StructureItem } from '@/types/structure'
import { cn } from '@/lib/utils'

export default function CourseDetailPage() {
  const params = useParams()
  const courseId = params.courseId as string
  
  const { isAdmin, isLoading: adminLoading } = useAdmin()
  const { course, isLoading: courseLoading, refetch: refetchCourse } = useCourse(courseId)
  const { items, isLoading: structureLoading, refetch: refetchStructure } = useStructure(courseId)
  const { createItem, updateItem, deleteItem } = useStructureActions()

  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // Fullscreen State (Lifted for URL persistence)
  const [fullscreen, setFullscreen] = useState(false)
  
  // Resizable Sidebar State
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const sidebarLeftRef = useRef<number>(0) // STORE LEFT OFFSET

  // Handle Resize Logic
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault() // prevent text selection
    if (sidebarRef.current) {
        // Capture the exact starting left position
        sidebarLeftRef.current = sidebarRef.current.getBoundingClientRect().left
    }
    setIsResizing(true)
  }, [])

  const stopResizing = useCallback(() => {
    setIsResizing(false)
  }, [])

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing) {
      // Calculate new width: Mouse X - Sidebar Left Edge
      const newWidth = mouseMoveEvent.clientX - sidebarLeftRef.current
      
      // Clamp values (Min 240, Max 800 for wider screens?)
      // Using Math.max/min ensures we don't "lose" the handle if mouse goes out of bounds
      const clampedWidth = Math.max(240, Math.min(newWidth, 800))
      setSidebarWidth(clampedWidth)
    }
  }, [isResizing])

  useEffect(() => {
    if (isResizing) {
      window.addEventListener("mousemove", resize)
      window.addEventListener("mouseup", stopResizing)
    }
    return () => {
      window.removeEventListener("mousemove", resize)
      window.removeEventListener("mouseup", stopResizing)
    }
  }, [isResizing, resize, stopResizing])

  // 1. Init from URL on Mount
  useEffect(() => {
    const urlItemId = searchParams.get('itemId')
    const urlFullscreen = searchParams.get('fullscreen') === 'true'

    if (urlItemId && urlItemId !== selectedId) {
        setSelectedId(urlItemId)
    }
    if (urlFullscreen) {
        setFullscreen(true)
    }
  }, []) // Run once on mount to hydrate state from URL

  // 2. Sync State to URL
  useEffect(() => {
    // Determine target URL state
    const currentParams = new URLSearchParams(searchParams.toString())
    
    // Check if update is needed to avoid redundant replacements
    const currentUrlId = currentParams.get('itemId')
    const currentUrlFs = currentParams.get('fullscreen') === 'true'

    let needsUpdate = false

    if (selectedId) {
        if (currentUrlId !== selectedId) {
            currentParams.set('itemId', selectedId)
            needsUpdate = true
        }
    } else {
        if (currentUrlId) {
            currentParams.delete('itemId')
            needsUpdate = true
        }
    }

    if (fullscreen !== currentUrlFs) {
        if (fullscreen) currentParams.set('fullscreen', 'true')
        else currentParams.delete('fullscreen')
        needsUpdate = true
    }

    if (needsUpdate) {
        router.replace(`${pathname}?${currentParams.toString()}`, { scroll: false })
    }
  }, [selectedId, fullscreen])

  // Helper to find item in tree
  const findItem = (items: StructureItem[], id: string): StructureItem | null => {
    for (const item of items) {
      if (item.id === id) return item
      if (item.children) {
        const found = findItem(item.children, id)
        if (found) return found
      }
    }
    return null
  }

  const selectedItem = selectedId ? findItem(items, selectedId) : null

  const handleCreateItem = (type: 'folder' | 'file') => {
    // Determine parent: 
    // If folder selected -> that's the parent
    // If file selected -> file's parent is the parent (sibling)
    // If nothing selected -> root
    let parentId: string | null = null

    if (selectedItem) {
      if (selectedItem.item_type === 'folder') {
        parentId = selectedItem.id
      } else {
        parentId = selectedItem.parent_id
      }
    }

    const newItemId = createItem({
      course_id: courseId,
      parent_id: parentId,
      item_type: type,
      title: type === 'folder' ? 'New Module' : 'New Note',
      order_index: 9999 // Hook handles reordering usually, or draft store appends
    })

    // Auto-select and Enter Edit Mode
    setSelectedId(newItemId)
    setEditingId(newItemId)
  }

  // Legacy handler passed to tree's specific "Add" dropdown actions
  const handleAddItemSpecific = (parentId: string | null, type: 'folder' | 'file') => {
    const newItemId = createItem({
      course_id: courseId,
      parent_id: parentId,
      item_type: type,
      title: type === 'folder' ? 'New Module' : 'New Note',
      order_index: 9999
    })
    setSelectedId(newItemId)
    setEditingId(newItemId)
  }

  const handleDeleteItem = (item: StructureItem) => {
    if (confirm(`Delete '${item.title}'? ${item.children && item.children.length > 0 ? 'All contents inside will be permanently deleted.' : ''}`)) {
      
      // Collect all IDs to delete (recursive)
      const idsToDelete: string[] = []
      const collectIds = (currentItem: StructureItem) => {
        idsToDelete.push(currentItem.id)
        if (currentItem.children) {
          currentItem.children.forEach(collectIds)
        }
      }
      collectIds(item)

      // Delete all
      idsToDelete.forEach(id => deleteItem(id))

      // Clear selection if deleted
      if (selectedId && idsToDelete.includes(selectedId)) {
        setSelectedId(null)
      }
    }
  }

  const handleSelectItem = (id: string) => {
    setSelectedId(id)
  }

  // --- Copy JSON Feature ---
  const handleCopyJson = (mode: 'current' | 'template') => {
    if (!course || !items) return

    // Helper to deeply clone and transform
    const processItems = (list: StructureItem[], idMap?: Map<string, string>, counter?: { current: number }): any[] => {
        return list.map((item, index) => {
             let newId = item.id
             
             // Template Mode: Generate sequential IDs (1, 1.1, etc is hard for flat map, simplified to 1, 2, 3 unique)
             // Actually, simple unique strings "1", "2" etc are fine.
             if (mode === 'template') {
                 if (!idMap) idMap = new Map()
                 if (!counter) counter = { current: 1 } // Should pass from root
                 
                 // We need a global counter for flat ID uniqueness or per-level?
                 // The import modal requires UNIQUE string IDs.
                 // Let's use a simple incrementing counter for the whole tree.
                 // But wait, the recursive call needs the shared counter.
                 // We'll handle this by generating ids in a flat pass or passing ref.
             }

            return {
                id: item.id, // Placeholder, replaced below if needed
                type: item.item_type,
                title: item.title,
                hasNotes: !!item.note_content,
                hasQuiz: !!item.attached_quiz,
                children: item.children ? [] : [] // Placeholder
            }
        })
    }

    // Better approach for Template Mode: Pre-calculate ID mappings
    let mappedStructure = []
    
    if (mode === 'template') {
        let counter = 1
        const idMap = new Map<string, string>()
        
        // 1. First Pass: Assign new IDs
        const traverseAndMap = (list: StructureItem[]) => {
            list.forEach(item => {
                idMap.set(item.id, counter.toString())
                counter++
                if (item.children) traverseAndMap(item.children)
            })
        }
        traverseAndMap(items)

        // 2. Second Pass: Build new structure
        const buildTemplate = (list: StructureItem[]): any[] => {
            return list.map(item => ({
                id: idMap.get(item.id)!,
                type: item.item_type,
                title: item.title,
                hasNotes: !!item.note_content,
                hasQuiz: !!item.attached_quiz,
                children: item.children ? buildTemplate(item.children) : []
            }))
        }
        mappedStructure = buildTemplate(items)
        
    } else {
        // Current Mode: Keep UUIDs
        const buildCurrent = (list: StructureItem[]): any[] => {
            return list.map(item => ({
                id: item.id,
                type: item.item_type,
                title: item.title,
                hasNotes: !!item.note_content,
                hasQuiz: !!item.attached_quiz,
                children: item.children ? buildCurrent(item.children) : []
            }))
        }
        mappedStructure = buildCurrent(items)
    }

    const exportData = {
        courseName: course.name,
        courseDescription: course.description || '',
        isPublic: course.is_active,
        structure: mappedStructure
    }

    const jsonString = JSON.stringify(exportData, null, 2)
    
    navigator.clipboard.writeText(jsonString)
        .then(() => toast.success(mode === 'template' ? 'Course Template copied!' : 'Course JSON copied!'))
        .catch(() => toast.error('Failed to copy to clipboard'))
  }

  console.log('StudioPage: Loading states:', { adminLoading, courseLoading, structureLoading })

  if (adminLoading || courseLoading || structureLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center">
        <p className="text-destructive mb-4">Course not found</p>
        <Link href="/admin/studio">
          <Button variant="outline">Go Back</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 w-full px-4 h-[calc(100vh-100px)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/admin/studio">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl bg-primary/10">
              {course.icon || '📚'}
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">
                {course.name}
              </h1>
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                Course Structure
                {selectedItem && (
                   <>
                    <ChevronRight className="w-3 h-3" />
                    <span className="font-medium text-primary">{selectedItem.title}</span>
                   </>
                )}
              </p>
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-2">
            <CourseDeclarationModal 
              courseId={courseId}
              onStructureCreated={refetchStructure}
              createItem={createItem}
            />
            <Button variant="outline" size="sm" onClick={() => handleCreateItem('file')}>
              <FileText className="w-4 h-4 mr-2" />
              Add Note
            </Button>
            <Button size="sm" onClick={() => handleCreateItem('folder')}>
               <Folder className="w-4 h-4 mr-2" />
              Add Module
            </Button>
            
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="icon" title="Export Course">
                        <Copy className="w-4 h-4" />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleCopyJson('current')}>
                        <FileJson className="w-4 h-4 mr-2" />
                        Copy Current JSON
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleCopyJson('template')}>
                        <FileType className="w-4 h-4 mr-2" />
                        Copy as Template
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Main Content Area - Flex Row for Resizing */}
      <div className="flex flex-1 min-h-0 overflow-hidden relative" onMouseUp={stopResizing}>
        {/* Left Sidebar: Structure Tree */}
        <div 
            ref={sidebarRef}
            style={{ width: sidebarWidth, flexShrink: 0 }}
            className="hidden lg:flex bg-white border border-border rounded-xl flex-col overflow-hidden shadow-sm h-full z-10"
        >
          <div className="p-4 border-b border-border bg-slate-50/50 flex items-center justify-between shrink-0">
            <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              {items.length} Items
            </h3>
            <div className="flex gap-2">
               {/* Optional Toolbar items */}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {items.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                <Folder className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>This course is empty.</p>
                {isAdmin && (
                    <p className="text-sm mt-1">Add a module to get started.</p>
                )}
                </div>
            ) : (
                <StructureTree 
                items={items}
                isAdmin={isAdmin}
                onAdd={handleAddItemSpecific}
                onEdit={updateItem}
                onDelete={handleDeleteItem}
                onSelect={handleSelectItem}
                selectedId={selectedId}
                editingId={editingId}
                setEditingId={setEditingId}
                />
            )}
          </div>
        </div>

        {/* Drag Handle */}
        <div
            className={cn(
                "hidden lg:flex w-4 -ml-2 z-20 cursor-col-resize items-center justify-center group hover:bg-slate-100/50 transition-colors select-none",
                isResizing && "bg-blue-100/50 w-6 -ml-3"
            )}
            onMouseDown={startResizing}
        >
            <div className={cn(
                "w-1 h-8 rounded-full bg-slate-200 group-hover:bg-blue-400 transition-colors",
                isResizing && "bg-blue-500 h-full w-0.5"
            )} />
        </div>

        {/* Editor Panel */}
        <div className={cn(
            "flex-1 flex flex-col overflow-hidden transition-all duration-300",
            fullscreen 
                ? "fixed inset-0 z-50 bg-slate-50 p-0" 
                : "bg-white border border-border rounded-xl shadow-sm h-full"
        )}>
          {selectedItem ? (
             <EditorPanel 
                key={selectedItem.id} // Re-mount if item changes to ensure fresh state
                itemId={selectedItem.id}
                itemType={selectedItem.item_type}
                courseId={courseId}
                title={selectedItem.title}
                onClose={() => setSelectedId(null)}
                // Controlled Expansion
                isExpandedControlled={fullscreen}
                onExpandChange={setFullscreen}
                onTitleChange={(newTitle) => {
                    updateItem(selectedItem.id, { title: newTitle })
                }}
             />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
              <FileText className="w-16 h-16 mb-4 opacity-20" />
              <p>Select a note or quiz to edit</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
