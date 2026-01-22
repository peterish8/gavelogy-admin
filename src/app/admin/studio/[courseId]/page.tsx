'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation'
import Link from 'next/link'
import { Plus, Loader2, ArrowLeft, Settings, Folder, FileText, ChevronRight, Edit2, Maximize2, Minimize2, Copy, FileJson, FileType, MoreHorizontal, GripVertical, Search, X, StickyNote, HelpCircle } from 'lucide-react'
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
import { SaveBar } from '@/components/admin/save-bar'
import type { StructureItem } from '@/types/structure'
import { cn } from '@/lib/utils'

// DND Kit Imports
import {
  DndContext,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'

export default function CourseDetailPage() {
  const params = useParams()
  const courseId = params.courseId as string
  
  const { isAdmin, isLoading: adminLoading } = useAdmin()
  const { course, isLoading: courseLoading, refetch: refetchCourse } = useCourse(courseId)
  const { items, isLoading: structureLoading, refetch: refetchStructure } = useStructure(courseId)
  const { createItem, updateItem, deleteItem, moveItem } = useStructureActions()

  const router = useRouter()
  const searchParams = useSearchParams()
  const pathname = usePathname()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  
  // Search State
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [filteredIds, setFilteredIds] = useState<Set<string> | null>(null)

  // Fullscreen State (Lifted for URL persistence)
  const [fullscreen, setFullscreen] = useState(false)
  
  // Resizable Sidebar State
  const [sidebarWidth, setSidebarWidth] = useState(320)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const sidebarLeftRef = useRef<number>(0) // STORE LEFT OFFSET

  // DND Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
        activationConstraint: {
            distance: 8, // Require 8px drag to start (prevents accidental drags on click)
        },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // --- Stats Calculation ---
  const stats = useMemo(() => {
    let folders = 0
    let files = 0
    let notes = 0
    let quizzes = 0

    const traverse = (list: StructureItem[]) => {
        list.forEach(item => {
            // Dynamic Stats: Skip items hidden by search
            if (filteredIds !== null && !filteredIds.has(item.id)) return

            if (item.item_type === 'folder') folders++
            else {
                files++
                if (item.note_content && item.note_content.content_html) notes++
                if (item.attached_quiz) quizzes++
            }
            if (item.children) traverse(item.children)
        })
    }
    traverse(items || [])
    return { folders, files, notes, quizzes }
  }, [items, filteredIds])

  // Helper to find all parent IDs for a given item ID (Search Logic)
  const getAllParentIds = (targetId: string, currentItems: StructureItem[], path: string[] = []): string[] | null => {
    for (const item of currentItems) {
        if (item.id === targetId) {
            return path
        }
        if (item.children) {
            const result = getAllParentIds(targetId, item.children, [...path, item.id])
            if (result) return result
        }
    }
    return null
  }
  
  const handleSearch = (query: string) => {
    setSearchQuery(query)
    
    if (!query.trim()) {
      setExpandedIds(new Set())
      setFilteredIds(null)
      return
    }

    const lowerQuery = query.toLowerCase()
    const newExpandedIds = new Set<string>()
    const newVisibleIds = new Set<string>()

    // DSA Expert: Recursive Search with Path Collection
    const traverse = (list: StructureItem[]): boolean => {
      let anyMatchInList = false
      
      for (const item of list) {
        // 1. Check Self
        const selfMatch = item.title.toLowerCase().includes(lowerQuery)
        
        // 2. Check Children (Recursion)
        let childMatch = false
        if (item.children && item.children.length > 0) {
             childMatch = traverse(item.children)
        }

        // 3. Significance Logic
        // If I match OR my children match, I am significant (visible).
        if (selfMatch || childMatch) {
            newVisibleIds.add(item.id)
            anyMatchInList = true
        }

        // 4. Expansion Logic
        // If my children matched, I must be expanded to show them.
        if (childMatch) {
            newExpandedIds.add(item.id)
        }
      }
      
      return anyMatchInList
    }

    traverse(items || [])
    setExpandedIds(newExpandedIds)
    setFilteredIds(newVisibleIds)
  }

  // Handle Resize Logic
  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault() // prevent text selection
    if (sidebarRef.current) {
        // Capture the exact starting left position
        const rect = sidebarRef.current.getBoundingClientRect()
        sidebarLeftRef.current = rect.left 
        setIsResizing(true)
    }
  }, [])

  const stopResizing = useCallback(() => {
    setIsResizing(false)
  }, [])

  const resize = useCallback((mouseMoveEvent: MouseEvent) => {
    if (isResizing) {
      // Calculate new width: Mouse X - Sidebar Left Edge
      const newWidth = mouseMoveEvent.clientX - sidebarLeftRef.current
      
      // Clamp values (Min 240, Max 800 for wider screens?)
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

  // Auto-Expand on Hover Logic
  const handleDragOver = useCallback((event: DragOverEvent) => {
    const { over, active } = event
    
    // Safety checks
    if (!over || !active) return
    if (over.id === active.id) return

    // Identify if hovering over a "container" (empty folder drop zone) or a regular item
    let targetId = over.id as string
    
    // If hovering over a drop container (e.g., "container-folder123"), extract IDs
    if (targetId.startsWith('container-')) {
        // Already inside, no need to expand.
        return 
    }

    // Find the item we are hovering over
    const overItem = findItem(items || [], targetId)
    
    // If it's a folder and it's NOT open, open it!
    if (overItem && overItem.item_type === 'folder') {
        setExpandedIds((prev) => {
            if (!prev.has(overItem.id)) {
                return new Set(prev).add(overItem.id)
            }
            return prev
        })
    }
  }, [items])

  // Helper to find parent items (returns array for root)
  const findContainerItems = (id: string, currentItems: StructureItem[]): StructureItem[] | undefined => {
    // Check if in root
    if (currentItems.find(i => i.id === id)) return currentItems

    // Check children
    for (const item of currentItems) {
        if (item.children) {
            const found = findContainerItems(id, item.children)
            if (found) return found
        }
    }
    return undefined
  }

  // Helper to find the parent object of an ID
  const findParent = (id: string, currentItems: StructureItem[], parent: StructureItem | null = null): StructureItem | null => {
      if (currentItems.find(i => i.id === id)) return parent;
      
      for (const item of currentItems) {
          if (item.children) {
              const found = findParent(id, item.children, item)
              if (found !== undefined) return found
          }
      }
      return null
  }

  const selectedItem = selectedId ? findItem(items, selectedId) : null

  // --- DND HANDLER ---
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    
    if (!over || active.id === over.id) return
    
    // 1. Check if dropped on a Container (Empty folder or gap)
    if (over.id.toString().startsWith('container-')) {
        const containerId = over.id.toString().replace('container-', '')
        const newParentId = containerId === 'root' ? null : containerId
        
        // Prevent dropping folder into itself
        if (active.id === newParentId) return
        
        // Move to end of that folder
        moveItem(active.id as string, newParentId, 999999) // Append
        toast.success("Moved to folder.")
        return
    }

    // 2. Dropped on an Item (Reorder or Move between existing items)
    // Find containers for both items
    const activeContainer = findContainerItems(active.id as string, items)
    const overContainer = findContainerItems(over.id as string, items)
    
    if (activeContainer && overContainer) {
        // Find parent ID of the target container (where 'over' item lives)
        const overParent = findParent(over.id as string, items)
        const newParentId = overParent ? overParent.id : null
        
        // Prevent dropping parent into its own child (Circular dependency)
        // We need a helper `isChild(parentId, childId)`? 
        // For now, let's just rely on backend loop prevention or check depth.
        // Quick check: traverse up from newParent to see if we hit active.id
        // But `overParent` is the *immediate* parent. 
        // If I drag "Folder A" into "Folder A > Child B", newParent is "Folder A".
        // Wait, if I drag Folder A into Child B, newParent is Child B.
        // We must check if `active.id` is an ancestor of `newParentId`.
        let checkId = newParentId
        let isAncestor = false
        while (checkId) {
            if (checkId === active.id) {
                isAncestor = true
                break
            }
            const parent = findParent(checkId, items)
            checkId = parent ? parent.id : null
        }
        if (isAncestor) {
            toast.error("Cannot move a folder into its own child.")
            return
        }

        const oldIndex = activeContainer.findIndex(i => i.id === active.id)
        const newIndex = overContainer.findIndex(i => i.id === over.id)

        if (activeContainer === overContainer) {
             // Same Container Reordering
             if (oldIndex !== -1 && newIndex !== -1) {
                 const newOrder = arrayMove(activeContainer, oldIndex, newIndex)
                 newOrder.forEach((item, index) => {
                     const desiredOrder = (index + 1) * 1024
                     if (item.order_index !== desiredOrder) {
                         updateItem(item.id, { order_index: desiredOrder, course_id: courseId })
                     }
                 })
                 toast.success("Order changed.")
            }
        } else {
            // Reparenting to a different list (between items)
            const overItem = overContainer[newIndex]
            let desiredOrder = 0;
            
            if (newIndex === 0) {
                 // Placed at top
                 desiredOrder = overItem.order_index / 2
            } else {
                 // Placed after someone
                 // We need to be careful with index. Rephrase:
                 // We are dropping OVER item X. 
                 // If we came from above? Irrelevant in different container.
                 // Usually replace strategy -> we take X's spot, X moves down.
                 
                 // If taking X's spot (newIndex), we want order < X.order.
                 // Similar to "top" logic, but relative to X and X-1.
                 
                 desiredOrder = overItem.order_index - 100
                 if (desiredOrder <= 0) desiredOrder = 100
            }

            moveItem(active.id as string, newParentId, desiredOrder)
            toast.success("Moved and reordered.")
        }
    }
  }

  const handleCreateItem = (type: 'folder' | 'file') => {
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
      order_index: 999999
    })

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
      order_index: 999999
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

  // Calculate next order index for appending new items
  const maxOrderIndex = items && items.length > 0 
    ? Math.max(...items.map(i => i.order_index)) 
    : 0
  const nextOrderIndex = maxOrderIndex + 1

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
              nextOrderIndex={nextOrderIndex}
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
        <DndContext 
            sensors={sensors} 
            collisionDetection={pointerWithin} 
            onDragOver={handleDragOver}
            onDragEnd={(e) => {
                if (searchQuery) return; // Disable DND during search
                handleDragEnd(e);
            }}
        >
            <div 
                ref={sidebarRef}
                style={{ width: sidebarWidth, flexShrink: 0 }}
                className="hidden lg:flex bg-white border border-border rounded-xl flex-col overflow-hidden shadow-sm h-full z-10"
            >
            <div className="p-4 border-b border-border bg-slate-50/50 flex flex-col gap-4 shrink-0 transition-all">
               
                {/* Cute Stats Dashboard */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white border border-blue-100 p-2.5 rounded-xl flex items-center gap-3 shadow-sm">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                             <Folder className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{stats.folders}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Modules</span>
                        </div>
                    </div>
                    
                    <div className="bg-white border border-purple-100 p-2.5 rounded-xl flex items-center gap-3 shadow-sm">
                        <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center text-purple-600">
                             <FileText className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{stats.files}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Files</span>
                        </div>
                    </div>

                    <div className="bg-white border border-amber-100 p-2.5 rounded-xl flex items-center gap-3 shadow-sm">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600">
                             <StickyNote className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{stats.notes}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Content</span>
                        </div>
                    </div>

                    <div className="bg-white border border-rose-100 p-2.5 rounded-xl flex items-center gap-3 shadow-sm">
                        <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">
                             <HelpCircle className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700">{stats.quizzes}</span>
                            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Quizzes</span>
                        </div>
                    </div>
                </div>
                
                {/* Search Bar */}
                <div className="relative group">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-primary transition-colors" />
                    <input 
                        type="text" 
                        placeholder="Filter course structure..." 
                        className="w-full pl-9 pr-8 h-10 text-sm rounded-xl border border-slate-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-slate-400"
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                    />
                     {searchQuery && (
                        <button 
                            onClick={() => handleSearch('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    )}
                </div>
            </div>

            {/* Tree Area */}
            <div className="flex-1 overflow-y-auto p-2 scrollbar-hide">
                {items.length === 0 && !searchQuery ? (
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
                        expandedIds={expandedIds}
                        searchQuery={searchQuery}
                    />
                )}
            </div>
            </div>
        </DndContext>

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
      
      {/* Save Bar for Reordering Changes */}
      <SaveBar />
    </div>
  )
}
