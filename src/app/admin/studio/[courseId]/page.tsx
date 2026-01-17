'use client'

import { useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, Loader2, ArrowLeft, Settings, Folder, FileText, ChevronRight, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAdmin } from '@/contexts/admin-context'
import { useCourse } from '@/hooks/use-courses'
import { useStructure, useStructureActions } from '@/hooks/use-structure'
import { StructureTree } from '@/components/course/structure-tree'
import { EditorPanel } from '@/components/course/editor-panel'
import { CourseDeclarationModal } from '@/components/course/course-declaration-modal'
import type { StructureItem } from '@/types/structure'

export default function CourseDetailPage() {
  const params = useParams()
  const courseId = params.courseId as string
  
  const { isAdmin, isLoading: adminLoading } = useAdmin()
  const { course, isLoading: courseLoading, refetch: refetchCourse } = useCourse(courseId)
  const { items, isLoading: structureLoading, refetch: refetchStructure } = useStructure(courseId)
  const { createItem, updateItem, deleteItem } = useStructureActions()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

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
    <div className="space-y-6 max-w-5xl mx-auto h-[calc(100vh-100px)] flex flex-col">
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
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Left Sidebar: Structure Tree */}
        <div className="lg:col-span-5 xl:col-span-4 bg-white border border-border rounded-xl flex flex-col overflow-hidden shadow-sm h-full">
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

        {/* Right Panel: Editor */}
        <div className="lg:col-span-7 xl:col-span-8 h-full min-h-[500px]">
           <EditorPanel 
             itemId={selectedId}
             itemType={selectedItem?.item_type || null}
             courseId={courseId}
             title={selectedItem?.title || ''}
             onTitleChange={(newTitle) => {
               if (selectedId) {
                 updateItem(selectedId, { title: newTitle })
               }
             }}
           />
        </div>
      </div>
    </div>
  )
}
