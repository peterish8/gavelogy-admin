import { create } from 'zustand'
import { useShallow } from 'zustand/react/shallow'
import { createClient } from '@/lib/supabase/client'
import type { DraftChange, EntityType } from '@/types/course-builder'

interface DraftState {
  // State
  changes: DraftChange[]
  hasUnsavedChanges: boolean
  isSaving: boolean
  lastSaveError: string | null

  // Actions
  addChange: (change: Omit<DraftChange, 'id' | 'timestamp'>) => void
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

      // Group changes by type and action for efficient processing
      const deleteChanges = changes.filter(c => c.action === 'delete')
      const createChanges = changes.filter(c => c.action === 'create')
      const updateChanges = changes.filter(c => c.action === 'update' || c.action === 'reorder')

      // Process deletions first
      for (const change of deleteChanges) {
        const tableName = getTableName(change.entityType)
        const { error } = await supabase
          .from(tableName)
          .delete()
          .eq('id', change.entityId)

        if (error) throw new Error(`Failed to delete ${change.entityType}: ${error.message}`)
      }

      // Process creates
      for (const change of createChanges) {
        const tableName = getTableName(change.entityType)
        const { error } = await supabase
          .from(tableName)
          .insert(change.data)

        if (error) throw new Error(`Failed to create ${change.entityType}: ${error.message}`)
      }

      // Process updates
      for (const change of updateChanges) {
        const tableName = getTableName(change.entityType)
        const { error } = await supabase
          .from(tableName)
          .update(change.data)
          .eq('id', change.entityId)

        if (error) throw new Error(`Failed to update ${change.entityType}: ${error.message}`)
      }

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

