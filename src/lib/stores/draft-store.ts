import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { createClient } from '@/lib/supabase/client'
import type { DraftChange, EntityType } from '@/types/course-builder'
import { useCourseStore } from './course-store'

interface DraftState {
  // State
  changes: DraftChange[]
  hasUnsavedChanges: boolean
  isSaving: boolean
  lastSaveError: string | null

  // Actions
  addChange: (change: Omit<DraftChange, 'id' | 'timestamp'>) => void
  addChanges: (changesList: Omit<DraftChange, 'id' | 'timestamp'>[]) => void
  updateChange: (entityId: string, updates: Partial<DraftChange>) => void
  removeChange: (entityId: string) => void
  getChangeForEntity: (entityId: string) => DraftChange | undefined
  getChangesForType: (entityType: EntityType) => DraftChange[]
  clearChanges: () => void

  // Commit actions
  commitChanges: () => Promise<{ success: boolean; error?: string }>
  discardChanges: () => void

  // Reorder helpers
  addReorderChange: (entityType: EntityType, entityId: string, newOrder: number, originalOrder: number) => void
}

export const useDraftStore = create<DraftState>((set, get) => ({
  // Initial state
  changes: [],
  hasUnsavedChanges: false,
  isSaving: false,
  lastSaveError: null,

  // Add a new change or update existing one
  addChange: (change) => set((state) => {
    const id = `${change.entityType}-${change.entityId}-${Date.now()}`
    const existingIndex = state.changes.findIndex(
      (c) => c.entityId === change.entityId && c.entityType === change.entityType
    )

    console.log('DraftStore: addChange', { 
        action: change.action, 
        entityId: change.entityId, 
        existingIndex,
        data: change.data 
    })

    let newChanges: DraftChange[]

    if (existingIndex >= 0) {
      // Update existing change - merge data
      newChanges = [...state.changes]
      const existing = newChanges[existingIndex]
      console.log('DraftStore: merging with existing', existing)
      newChanges[existingIndex] = {
        ...existing,
        action: change.action === 'delete' ? 'delete' : existing.action,
        data: { ...existing.data, ...change.data },
        timestamp: Date.now()
      }
    } else {
      // Add new change
      const newChange: DraftChange = {
        ...change,
        id,
        timestamp: Date.now()
      }
      newChanges = [...state.changes, newChange]
    }

    return {
      changes: newChanges,
      hasUnsavedChanges: newChanges.length > 0,
      lastSaveError: null
    }
  }),

  // Add multiple changes at once
  addChanges: (changesList) => set((state) => {
    const updatedChanges = [...state.changes]
    const now = Date.now()

    changesList.forEach((change, index) => {
      const existingIndex = updatedChanges.findIndex(
        (c) => c.entityId === change.entityId && c.entityType === change.entityType
      )

      if (existingIndex >= 0) {
        const existing = updatedChanges[existingIndex]
        updatedChanges[existingIndex] = {
          ...existing,
          action: change.action === 'delete' ? 'delete' : existing.action,
          data: { ...existing.data, ...change.data },
          timestamp: now
        }
      } else {
        updatedChanges.push({
          ...change,
          id: `${change.entityType}-${change.entityId}-${now}-${index}`,
          timestamp: now
        })
      }
    })

    return {
      changes: updatedChanges,
      hasUnsavedChanges: updatedChanges.length > 0,
      lastSaveError: null
    }
  }),

  // Update an existing change
  updateChange: (entityId, updates) => set((state) => {
    const newChanges = state.changes.map((c) =>
      c.entityId === entityId ? { ...c, ...updates, timestamp: Date.now() } : c
    )
    return {
      changes: newChanges,
      hasUnsavedChanges: newChanges.length > 0
    }
  }),

  // Remove a change (e.g., when undoing)
  removeChange: (entityId) => set((state) => {
    const newChanges = state.changes.filter((c) => c.entityId !== entityId)
    return {
      changes: newChanges,
      hasUnsavedChanges: newChanges.length > 0
    }
  }),

  // Get a specific change
  getChangeForEntity: (entityId) => {
    return get().changes.find((c) => c.entityId === entityId)
  },

  // Get all changes for a specific type
  getChangesForType: (entityType) => {
    return get().changes.filter((c) => c.entityType === entityType)
  },

  // Clear all changes (after successful save or discard)
  clearChanges: () => set({
    changes: [],
    hasUnsavedChanges: false,
    lastSaveError: null
  }),

  // Discard all changes
  discardChanges: () => set({
    changes: [],
    hasUnsavedChanges: false,
    lastSaveError: null
  }),

  // Add a reorder change
  addReorderChange: (entityType, entityId, newOrder, originalOrder) => {
    const { addChange } = get()
    addChange({
      action: 'reorder',
      entityType,
      entityId,
      data: { order_index: newOrder },
      originalData: { order_index: originalOrder }
    })
  },

  // Commit all changes to the database
  commitChanges: async () => {
    const { changes } = get()

    if (changes.length === 0) {
      return { success: true }
    }

    set({ isSaving: true, lastSaveError: null })

    try {
      const supabase = createClient()
      
      console.log('[DraftStore] Starting commit with', changes.length, 'changes')

      // Group changes for batching
      const deleteChanges = changes.filter(c => c.action === 'delete')
      const createChanges = changes.filter(c => c.action === 'create')
      const updateChanges = changes.filter(c => c.action === 'update' || c.action === 'reorder')

      // 1. Batch Deletions
      if (deleteChanges.length > 0) {
        console.log('[DraftStore] Deleting', deleteChanges.length, 'items...')
        const deletionsByTable = deleteChanges.reduce((acc, c) => {
          const table = getTableName(c.entityType)
          if (!acc[table]) acc[table] = []
          acc[table].push(c.entityId)
          return acc
        }, {} as Record<string, string[]>)

        for (const [table, ids] of Object.entries(deletionsByTable)) {
          const { error } = await supabase.from(table).delete().in('id', ids)
          if (error) throw new Error(`Failed to delete from ${table}: ${error.message}`)
        }
        console.log('[DraftStore] Deletions complete')
      }

      // 2. Batch Inserts (Creates only)
      if (createChanges.length > 0) {
        console.log('[DraftStore] Inserting', createChanges.length, 'new items...')
        const insertsByTable = createChanges.reduce((acc, c) => {
          const table = getTableName(c.entityType)
          if (!acc[table]) acc[table] = []
          acc[table].push({ ...c.data, id: c.entityId })
          return acc
        }, {} as Record<string, any[]>)

        for (const [table, items] of Object.entries(insertsByTable)) {
          console.log(`[DraftStore] Inserting ${items.length} to ${table}...`)
          const { error } = await supabase.from(table).insert(items)
          if (error) throw new Error(`Failed to insert to ${table}: ${error.message}`)
        }
        console.log('[DraftStore] Inserts complete')
      }

      // 3. Individual Updates (to avoid overwriting existing data)
      if (updateChanges.length > 0) {
        console.log('[DraftStore] Updating', updateChanges.length, 'items...')
        for (const change of updateChanges) {
          const table = getTableName(change.entityType)
          const { error } = await supabase
            .from(table)
            .update(change.data)
            .eq('id', change.entityId)
          
          if (error) throw new Error(`Failed to update ${table}: ${error.message}`)
        }
        console.log('[DraftStore] Updates complete')
      }

      // SYNC: Apply committed changes to the course store cache
      // This makes UI update instantly without requiring reload
      const courseStore = useCourseStore.getState()
      
      // Get all structure_item changes and group by course_id
      const structureChanges = changes.filter(c => c.entityType === 'structure_item')
      const courseIds = new Set<string>()
      
      structureChanges.forEach(change => {
        const courseId = (change.data as any)?.course_id
        if (courseId) courseIds.add(courseId)
      })
      
      // For each affected course, apply changes to cached structure
      courseIds.forEach(courseId => {
        const cachedItems = courseStore.structures[courseId] || []
        let updatedItems = [...cachedItems]
        
        structureChanges.forEach(change => {
          if ((change.data as any)?.course_id !== courseId) return
          
          if (change.action === 'create') {
            // Add new item
            updatedItems.push(change.data as any)
          } else if (change.action === 'update' || change.action === 'reorder') {
            // Update existing item
            const index = updatedItems.findIndex(item => item.id === change.entityId)
            if (index !== -1) {
              updatedItems[index] = { ...updatedItems[index], ...change.data }
            }
          } else if (change.action === 'delete') {
            // Remove item
            updatedItems = updatedItems.filter(item => item.id !== change.entityId)
          }
        })
        
        // Update the store
        courseStore.setStructure(courseId, updatedItems)
      })

      // Clear changes on success
      set({
        changes: [],
        hasUnsavedChanges: false,
        isSaving: false,
        lastSaveError: null
      })

      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      set({ isSaving: false, lastSaveError: errorMessage })
      return { success: false, error: errorMessage }
    }
  }
}))

// Helper function to map entity types to table names
function getTableName(entityType: EntityType): string {
  switch (entityType) {
    case 'course':
      return 'courses'
    case 'subject':
      return 'subjects'
    case 'content_item':
      return 'content_items'
    case 'structure_item':
      return 'structure_items'
    default:
      throw new Error(`Unknown entity type: ${entityType}`)
  }
}

// Hook for checking if there are unsaved changes (for navigation guards)
export function useHasUnsavedChanges() {
  return useDraftStore((state) => state.hasUnsavedChanges)
}

// Hook for the save bar - uses useShallow to prevent infinite loops
export function useSaveBar() {
  const hasUnsavedChanges = useDraftStore((state) => state.hasUnsavedChanges)
  const isSaving = useDraftStore((state) => state.isSaving)
  const lastSaveError = useDraftStore((state) => state.lastSaveError)
  const changesCount = useDraftStore((state) => state.changes.length)
  const commitChanges = useDraftStore((state) => state.commitChanges)
  const discardChanges = useDraftStore((state) => state.discardChanges)

  return {
    hasUnsavedChanges,
    isSaving,
    lastSaveError,
    changesCount,
    commitChanges,
    discardChanges
  }
}

