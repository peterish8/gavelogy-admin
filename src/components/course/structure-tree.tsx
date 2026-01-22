'use client'

import { useState, useEffect } from 'react'
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FileText, 
  MoreHorizontal, 
  Plus, 
  Trash2, 
  Edit2,
  GripVertical
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StructureItem } from '@/types/structure'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { InlineEditor } from '@/components/admin/inline-editor'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useDroppable } from '@dnd-kit/core'

interface StructureTreeProps {
  items: StructureItem[]
  parentId?: string | null
  depth?: number
  isAdmin: boolean
  onAdd: (parentId: string | null, type: 'folder' | 'file') => void | Promise<any>
  onEdit: (id: string, updates: Partial<StructureItem>) => void
  onDelete: (item: StructureItem) => void
  onSelect: (id: string) => void
  selectedId?: string | null
  editingId?: string | null
  setEditingId?: (id: string | null) => void
  filteredIds?: Set<string> | null
}

export function StructureTree({ 
  items, 
  parentId = null,
  depth = 0, 
  isAdmin, 
  onAdd, 
  onEdit, 
  onDelete, 
  onSelect,
  selectedId,
  editingId,
  setEditingId,
  expandedIds,
  searchQuery,
  filteredIds
}: StructureTreeProps & { expandedIds?: Set<string>; searchQuery?: string }) {
  
  // Make the list itself droppable to handle empty folders or dropping "at end"
  const { setNodeRef, isOver } = useDroppable({
    id: parentId ? `container-${parentId}` : 'container-root',
    data: { type: 'container', parentId },
    disabled: !!searchQuery // Disable container drops during search
  })

  // Filter items if search is active
  const displayItems = items 
    ? (filteredIds ? items.filter(item => filteredIds.has(item.id)) : items)
    : []

  if (filteredIds && displayItems.length === 0) return null

  return (
    <SortableContext 
      items={displayItems.map(item => item.id)} 
      strategy={verticalListSortingStrategy}
    >
      <div 
        ref={setNodeRef}
        className={cn(
            "flex flex-col gap-1 transition-colors rounded-md pb-2", 
            (!displayItems || displayItems.length === 0) && !searchQuery && "min-h-[40px] border-2 border-dashed border-transparent", // Hide drop zone borders during search
            isOver && !searchQuery && "bg-blue-50/50 border-blue-200"
        )}
      >
        {displayItems.map((item) => (
          <StructureItemRow
            key={item.id}
            item={item}
            depth={depth}
            isAdmin={isAdmin}
            onAdd={onAdd}
            onEdit={onEdit}
            onDelete={onDelete}
            onSelect={onSelect}
            selectedId={selectedId}
            editingId={editingId}
            setEditingId={setEditingId}
            expandedIds={expandedIds}
            searchQuery={searchQuery}
            filteredIds={filteredIds}
          />
        ))}
        {/* Placeholder text for empty folders */}
        {(!displayItems || displayItems.length === 0) && isOver && !searchQuery && (
            <div className="flex items-center justify-center h-full text-xs text-blue-400 font-medium">
                Drop here
            </div>
        )}
      </div>
    </SortableContext>
  )
}

function StructureItemRow({ 
  item, 
  depth, 
  isAdmin, 
  onAdd, 
  onEdit, 
  onDelete,
  onSelect,
  selectedId,
  editingId,
  setEditingId,
  expandedIds,
  searchQuery,
  filteredIds
}: { 
  item: StructureItem
  depth: number 
  isAdmin: boolean
  onAdd: (parentId: string | null, type: 'folder' | 'file') => void | Promise<any>
  onEdit: (id: string, updates: Partial<StructureItem>) => void
  onDelete: (item: StructureItem) => void
  onSelect: (id: string) => void
  selectedId?: string | null
  editingId?: string | null
  setEditingId?: (id: string | null) => void
  expandedIds?: Set<string>
  searchQuery?: string
  filteredIds?: Set<string> | null
}) {
  const [isOpen, setIsOpen] = useState(false)
  
  // Sync with external expansion state
  useEffect(() => {
    if (expandedIds) {
        if (searchQuery) {
             // Strict sync during search (Open matches, close non-matches)
             setIsOpen(expandedIds.has(item.id))
        } else if (expandedIds.has(item.id)) {
             // Normal mode: only auto-open specific requests, don't auto-close
             setIsOpen(true)
        }
    }
  }, [expandedIds, item.id, searchQuery])

  // Determine editing state: prioritize controlled prop, fallback to local (though we're moving to controlled)
  const isControlledEditing = editingId !== undefined
  const isEditing = isControlledEditing ? editingId === item.id : false
  const [localEditing, setLocalEditing] = useState(false)
  const effectivelyEditing = isControlledEditing ? isEditing : localEditing

  const isFolder = item.item_type === 'folder'
  const isSelected = selectedId === item.id

  // DND Kit Sortable Hook - DISABLED during search
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ 
      id: item.id, 
      data: { item },
      disabled: !!searchQuery // Disable DND when searching
  })

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : 'auto',
    position: 'relative' as const,
  }

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsOpen(!isOpen)
  }

  const handleRowClick = () => {
    onSelect(item.id)
    if (isFolder && !isOpen) {
        setIsOpen(true) // Auto-open on select if closed
    }
  }

  const startEditing = () => {
    if (setEditingId) setEditingId(item.id)
    else setLocalEditing(true)
  }

  const stopEditing = () => {
    if (setEditingId) setEditingId(null)
    else setLocalEditing(false)
  }

  // Helper for highlighting text
  const renderTitle = (title: string) => {
      if (!searchQuery) return title
      
      const parts = title.split(new RegExp(`(${searchQuery})`, 'gi'))
      return (
          <span>
              {parts.map((part, i) => 
                part.toLowerCase() === searchQuery.toLowerCase() ? (
                    <span key={i} className="bg-yellow-200 text-yellow-900 font-semibold px-0.5 rounded-sm">
                        {part}
                    </span>
                ) : (
                    part
                )
              )}
          </span>
      )
  }

  return (
    <div style={style}>
      <div 
        ref={setNodeRef}
        className={cn(
          "relative flex items-center gap-2 p-2 rounded-lg cursor-pointer group transition-colors pr-2", // Added relative
          isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/50",
          depth > 0 && "ml-6 border-l border-border pl-2" // Indentation line
        )}
        onClick={handleRowClick}
      >
        {/* Drag Handle - Only for admins */}
        {isAdmin && !searchQuery && (
           <div 
              {...attributes} 
              {...listeners} 
              className="p-1 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()} // Prevent row selection when clicking handle
           >
              <GripVertical className="w-4 h-4" />
           </div>
        )}

        {/* Expand/Collapse for Folders */}
        {isFolder ? (
          <button 
            onClick={handleToggle}
            className={cn(
                "p-0.5 rounded-sm hover:bg-muted/80 z-10",
                isSelected ? "text-primary hover:bg-primary/20" : "text-muted-foreground"
            )}
          >
            {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        ) : (
          <div className="w-5" /> // Spacer for files
        )}

        {/* Icon */}
        <div className={cn(
          "w-8 h-8 flex items-center justify-center rounded-md shrink-0",
          isFolder 
            ? (isSelected ? "bg-primary/20 text-primary" : "bg-blue-50 text-blue-600") 
            : (isSelected ? "bg-primary/20 text-primary" : "bg-gray-50 text-gray-600")
        )}>
           {isFolder ? <Folder className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          {effectivelyEditing ? (
            <InlineEditor
              value={item.title}
              onSave={(val) => {
                onEdit(item.id, { title: val })
                stopEditing()
              }}
              onCancel={stopEditing}
              className="h-8 text-sm"
              autoFocus
            />
          ) : (
            <span className="text-sm font-medium truncate block">
              {renderTitle(item.title)}
            </span>
          )}
        </div>

        {/* Actions Dropdown */}
        {isAdmin && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn(
                    "absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 transition-all z-20 hover:bg-slate-200", // Absolute position
                    (isSelected || isOpen) ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
                onClick={(e) => {
                    e.stopPropagation()
                    // If we click the menu, maybe select the row too?
                    onSelect(item.id)
                }}
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isFolder && (
                <>
                  <DropdownMenuItem onClick={() => onAdd(item.id, 'folder')}>
                    <Folder className="w-4 h-4 mr-2" /> Add Sub-folder
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAdd(item.id, 'file')}>
                    <FileText className="w-4 h-4 mr-2" /> Add Note File
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onClick={startEditing}>
                <Edit2 className="w-4 h-4 mr-2" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem 
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete(item)}
              >
                <Trash2 className="w-4 h-4 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Recursive Children */}
      {isFolder && isOpen && (
        <div className="mt-1">
          <StructureTree 
            items={item.children || []} 
            parentId={item.id}
            depth={depth + 1}
            isAdmin={isAdmin}
            onAdd={onAdd}
            onEdit={onEdit}
            onDelete={onDelete}
            onSelect={onSelect}
            selectedId={selectedId}
            editingId={editingId}
            setEditingId={setEditingId}
            expandedIds={expandedIds}
            searchQuery={searchQuery}
            filteredIds={filteredIds}
          />
        </div>
      )}
      
      {/* Empty State Text - Only if NOT dragging over (managed by StructureTree's droppable placeholder now) 
          Actually, StructureTree handles the empty view now if items is empty.
          We can remove the redundant "Empty folder" text here or keep it if not droppable?
          The StructureTree above will render the "Drop Zone". 
          We can remove specific empty handling here to rely on child StructureTree. 
      */}
    </div>
  )
}
