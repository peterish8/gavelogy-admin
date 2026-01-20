import { useState, useCallback, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { StructureItem, ItemType } from '@/types/structure'
import { useDraftStore } from '@/lib/stores/draft-store'
import { useCourseStore } from '@/lib/stores/course-store'

export function useStructure(courseId: string) {
  const store = useCourseStore()
  // const [items, setItems] = useState<StructureItem[]>([]) // REFACTOR: Using useMemo to prevent render lag
  
  // Cache check
  const storeData = store.structures[courseId]
  
  // Only load if logic says so (cache miss)
  const [isLoading, setIsLoading] = useState(!storeData) 
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  const { changes } = useDraftStore()
  
  const fetchStructureFromDb = useCallback(async (force = false) => {
    if (!courseId) {
      console.log('useStructure: no courseId, skipping')
      setIsLoading(false)
      return
    }

    if (isFetching) return
    setIsFetching(true)
    // Only set full loading state if we have NOTHING
    if (!storeData) setIsLoading(true)
    setError(null)

    // Safety timeout
    const timeoutId = setTimeout(() => {
        setIsFetching(false)
        setIsLoading(false)
    }, 5000)

    try {
      console.log('useStructure: Fetching for courseId:', courseId)
      const supabase = createClient()
      
      const { data, error: fetchError } = await supabase
        .from('structure_items')
        .select(`
          *,
          note_content:note_contents(id)
        `)
        .eq('course_id', courseId)
        .order('order_index', { ascending: true })

      if (fetchError) {
        console.error('useStructure: Supabase error:', fetchError)
        throw fetchError
      }
      
      console.log('useStructure: fetch success. Items found:', data?.length)
      if (!data || data.length === 0) {
          console.warn('useStructure: No items found for this course. Check database or RLS.')
      }
      
      store.setStructure(courseId, data || [])
    } catch (err) {
      console.error('Error fetching structure:', err)
      setError('Failed to load course structure')
    } finally {
      clearTimeout(timeoutId)
      setIsFetching(false)
      setIsLoading(false)
    }
  }, [courseId, store.setStructure, storeData]) // storeData used for check? Actually we can check inside execution but dependency is okay if we want to validte against stale? 
  // Wait, if I add storeData to dep here, fetching might loop if storeData changes?
  // Let's remove storeData from dependency and just use ref or trust the closure?
  // Actually, standard pattern:

  // Initial fetch & Sync on courseId change
  useEffect(() => {
    if (storeData) {
        setIsLoading(false)
    } else {
        fetchStructureFromDb()
    }
  }, [courseId, fetchStructureFromDb, storeData]) 
  
  // Derive final items from Store Data + Draft Changes
  const items = useMemo(() => {
    // If no store data and we are loading, return empty? 
    // Or just process what we have.
    // If storeData is missing, we treat it as empty until fetched.
    
    let processedData = [...(storeData || [])]

    const draftChanges = changes.filter(c => c.entityType === 'structure_item')
    
    draftChanges.forEach(change => {
      // NOTE: We only care about this course's items
      // For create, we need to check course_id
      if (change.action === 'create') {
        const newData = change.data as any
        if (newData.course_id === courseId) {
          processedData.push(newData)
        }
      } else if (change.action === 'update' || change.action === 'reorder') {
        // Only if item exists in this course (or was added to it)
        const index = processedData.findIndex(item => item.id === change.entityId)
        if (index !== -1) {
          processedData[index] = { ...processedData[index], ...change.data }
        }
      } else if (change.action === 'delete') {
        processedData = processedData.filter(item => item.id !== change.entityId)
      }
    })

    return buildTree(processedData)
  }, [storeData, changes, courseId])

  return { items, isLoading, error, refetch: fetchStructureFromDb }
}

// Helper to build recursive tree from flat array
function buildTree(items: any[]): StructureItem[] {
  const itemMap = new Map<string, StructureItem>()
  const rootItems: StructureItem[] = []

  // 1. Create all item objects
  items.forEach(item => {
    itemMap.set(item.id, { ...item, children: [] })
  })

  // 2. Link children to parents
  items.forEach(item => {
    const node = itemMap.get(item.id)!
    if (item.parent_id && itemMap.has(item.parent_id)) {
      const parent = itemMap.get(item.parent_id)!
      parent.children = parent.children || []
      parent.children.push(node)
    } else {
      rootItems.push(node)
    }
  })

  // 3. Sort each level
  const sortRecursive = (nodes: StructureItem[]) => {
    nodes.sort((a, b) => a.order_index - b.order_index)
    nodes.forEach(node => {
      if (node.children?.length) {
        sortRecursive(node.children)
      }
    })
  }

  sortRecursive(rootItems)
  return rootItems
}

// Actions hook
export function useStructureActions() {
  const addChange = useDraftStore((state) => state.addChange)

  const createItem = useCallback((data: {
    course_id: string
    parent_id: string | null
    item_type: ItemType
    title: string
    order_index: number
  }) => {
    const tempId = crypto.randomUUID()
    addChange({
      action: 'create',
      entityType: 'structure_item',
      entityId: tempId,
      data: {
        id: tempId,
        is_active: true,
        ...data
      }
    })
    return tempId
  }, [addChange])

  const updateItem = useCallback((id: string, updates: Partial<StructureItem>) => {
    addChange({
      action: 'update',
      entityType: 'structure_item',
      entityId: id,
      data: updates
    })
  }, [addChange])

  const deleteItem = useCallback((id: string) => {
    addChange({
      action: 'delete',
      entityType: 'structure_item',
      entityId: id,
      data: {}
    })
  }, [addChange])

  const moveItem = useCallback((id: string, newParentId: string | null, newIndex: number) => {
    addChange({
      action: 'reorder', // Handling move-to-folder as a specialized update/reorder
      entityType: 'structure_item',
      entityId: id,
      data: {
        parent_id: newParentId,
        order_index: newIndex
      }
    })
  }, [addChange])

  return { createItem, updateItem, deleteItem, moveItem }
}
