import { create } from 'zustand'
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

// Zustand store that tracks all pending create/update/delete/reorder changes before they are committed to the DB.
// Acts as the undo buffer for the course studio's save-bar workflow.
export const useDraftStore = create<DraftState>((set, get) => ({
  // Initial state
  changes: [],
  hasUnsavedChanges: false,
  isSaving: false,
  lastSaveError: null,

  // Queues one draft change, merging it into an existing entry for the same entity when possible.
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

  // Queues several draft changes together, reusing the same merge rules as addChange.
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

  // Patches a queued change in place, usually after a follow-up edit to the same entity.
  updateChange: (entityId, updates) => set((state) => {
    const newChanges = state.changes.map((c) =>
      c.entityId === entityId ? { ...c, ...updates, timestamp: Date.now() } : c
    )
    return {
      changes: newChanges,
      hasUnsavedChanges: newChanges.length > 0
    }
  }),

  // Removes the queued change for an entity, such as during undo or cleanup.
  removeChange: (entityId) => set((state) => {
    const newChanges = state.changes.filter((c) => c.entityId !== entityId)
    return {
      changes: newChanges,
      hasUnsavedChanges: newChanges.length > 0
    }
  }),

  // Looks up the pending change for one entity ID.
  getChangeForEntity: (entityId) => {
    return get().changes.find((c) => c.entityId === entityId)
  },

  // Returns only the queued changes for a specific entity type.
  getChangesForType: (entityType) => {
    return get().changes.filter((c) => c.entityType === entityType)
  },

  // Clears the entire draft queue after a successful save or manual discard.
  clearChanges: () => set({
    changes: [],
    hasUnsavedChanges: false,
    lastSaveError: null
  }),

  // Discards every queued change and resets dirty/error flags without saving anything.
  discardChanges: () => set({
    changes: [],
    hasUnsavedChanges: false,
    lastSaveError: null
  }),

  // Convenience helper for queuing reorder operations with both new and original positions.
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

  // Writes all pending changes to Supabase in batched delete/insert/update operations, then syncs course store cache.
  commitChanges: async () => {
    const { changes } = get()

    if (changes.length === 0) {
      return { success: true }
    }

    set({ isSaving: true, lastSaveError: null })

    try {
      const supabase = createClient()
      
      console.log('[DraftStore] Starting commit with', changes.length, 'changes')

      // Splits queued changes by action so deletes, inserts, and updates can be persisted efficiently.
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

      // Mirrors committed structure changes into the course store so the UI reflects saves immediately.
      const courseStore = useCourseStore.getState()
      
      // Collects affected course IDs so only relevant cached structures are updated.
      const structureChanges = changes.filter(c => c.entityType === 'structure_item')
      const courseIds = new Set<string>()
      
      structureChanges.forEach(change => {
        const courseId = (change.data as any)?.course_id
        if (courseId) courseIds.add(courseId)
      })
      
      // Replays creates, updates, and deletes into each affected cached structure list.
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

// Maps an EntityType string ('course' | 'subject' | 'content_item' | 'structure_item') to its Supabase table name.
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

// Selector hook returning true when there are pending unsaved changes — use in navigation guards / prompts.
export function useHasUnsavedChanges() {
  return useDraftStore((state) => state.hasUnsavedChanges)
}

// Composite hook that exposes all save-bar state (dirty flag, saving, error, count) and commit/discard actions.
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

