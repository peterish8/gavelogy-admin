'use client'

import { useState } from 'react'
import { 
  ChevronRight, 
  ChevronDown, 
  Folder, 
  FileText, 
  MoreHorizontal, 
  Plus, 
  Trash2, 
  Edit2
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

interface StructureTreeProps {
  items: StructureItem[]
  depth?: number
  isAdmin: boolean
  onAdd: (parentId: string | null, type: 'folder' | 'file') => void
  onEdit: (id: string, updates: Partial<StructureItem>) => void
  onDelete: (item: StructureItem) => void
  onSelect: (id: string) => void // Open file content
}

// ... imports
import { useEffect } from 'react'

interface StructureTreeProps {
  items: StructureItem[]
  depth?: number
  isAdmin: boolean
  onAdd: (parentId: string | null, type: 'folder' | 'file') => void
  onEdit: (id: string, updates: Partial<StructureItem>) => void
  onDelete: (item: StructureItem) => void
  onSelect: (id: string) => void
  selectedId?: string | null
  editingId?: string | null
  setEditingId?: (id: string | null) => void
}

export function StructureTree({ 
  items, 
  depth = 0, 
  isAdmin, 
  onAdd, 
  onEdit, 
  onDelete, 
  onSelect,
  selectedId,
  editingId,
  setEditingId
}: StructureTreeProps) {
  if (!items || items.length === 0) return null

  return (
    <div className="flex flex-col gap-1">
      {items.map((item) => (
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
        />
      ))}
    </div>
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
  setEditingId
}: { 
  item: StructureItem
  depth: number 
  isAdmin: boolean
  onAdd: (parentId: string | null, type: 'folder' | 'file') => void
  onEdit: (id: string, updates: Partial<StructureItem>) => void
  onDelete: (item: StructureItem) => void
  onSelect: (id: string) => void
  selectedId?: string | null
  editingId?: string | null
  setEditingId?: (id: string | null) => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  // Determine editing state: prioritize controlled prop, fallback to local (though we're moving to controlled)
  const isControlledEditing = editingId !== undefined
  const isEditing = isControlledEditing ? editingId === item.id : false
  const [localEditing, setLocalEditing] = useState(false)
  const effectivelyEditing = isControlledEditing ? isEditing : localEditing

  const isFolder = item.item_type === 'folder'
  const isSelected = selectedId === item.id

  // Auto-expand if child is selected (this is hard without traversing up, but we can do a simple check?)
  // Actually, parent expansion is usually handled by parent. We'll leave auto-expand for now.

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

  return (
    <div>
      <div 
        className={cn(
          "relative flex items-center gap-2 p-2 rounded-lg cursor-pointer group transition-colors pr-2", // Added relative
          isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/50",
          depth > 0 && "ml-6 border-l border-border pl-2" // Indentation line
        )}
        onClick={handleRowClick}
      >
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
              {item.title}
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
      {isFolder && isOpen && item.children && item.children.length > 0 && (
        <div className="mt-1">
          <StructureTree 
            items={item.children} 
            depth={depth + 1}
            isAdmin={isAdmin}
            onAdd={onAdd}
            onEdit={onEdit}
            onDelete={onDelete}
            onSelect={onSelect}
            selectedId={selectedId}
            editingId={editingId}
            setEditingId={setEditingId}
          />
        </div>
      )}
      
      {/* Empty State for Open Folder */}
      {isFolder && isOpen && (!item.children || item.children.length === 0) && (
        <div className="ml-11 py-2 text-xs text-muted-foreground italic">
          Empty folder
        </div>
      )}
    </div>
  )
}
