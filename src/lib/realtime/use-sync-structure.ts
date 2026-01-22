'use client'

import { useEffect, useCallback } from 'react'
import { useRealtime } from '@/lib/realtime/realtime-provider'
import { useCourseStore } from '@/lib/stores/course-store'

/**
 * useStructureSync - Real-time sync for course structure items
 * 
 * Subscribes to structure_items table changes and updates the local store
 * when other admins make changes (create/update/delete folders/files)
 */
export function useStructureSync(courseId: string | null) {
  const { subscribeToTable, isConnected } = useRealtime()
  const courseStore = useCourseStore()

  const handleStructureChange = useCallback((payload: any) => {
    if (!courseId) return
    
    const { eventType, new: newRecord, old: oldRecord } = payload
    
    // Only process changes for this course
    if (newRecord?.course_id !== courseId && oldRecord?.course_id !== courseId) {
      return
    }

    console.log('[StructureSync] Received:', eventType, newRecord || oldRecord)

    // Get current cached structure
    const currentItems = courseStore.structures[courseId] || []
    let updatedItems = [...currentItems]

    switch (eventType) {
      case 'INSERT':
        // Add new item if it doesn't already exist locally
        if (!updatedItems.find(item => item.id === newRecord.id)) {
          updatedItems.push(newRecord)
        }
        break
        
      case 'UPDATE':
        // Update existing item
        const updateIndex = updatedItems.findIndex(item => item.id === newRecord.id)
        if (updateIndex !== -1) {
          updatedItems[updateIndex] = { ...updatedItems[updateIndex], ...newRecord }
        } else {
          // Item doesn't exist locally, add it
          updatedItems.push(newRecord)
        }
        break
        
      case 'DELETE':
        // Remove deleted item
        updatedItems = updatedItems.filter(item => item.id !== oldRecord.id)
        break
    }

    // Update the store
    courseStore.setStructure(courseId, updatedItems)
  }, [courseId, courseStore])

  useEffect(() => {
    if (!isConnected || !courseId) return

    console.log('[StructureSync] Subscribing to structure_items for course:', courseId)
    
    const unsubscribe = subscribeToTable(
      'structure_items',
      handleStructureChange,
      { column: 'course_id', value: courseId }
    )

    return () => {
      console.log('[StructureSync] Unsubscribing from structure_items')
      unsubscribe()
    }
  }, [isConnected, courseId, subscribeToTable, handleStructureChange])

  return { isConnected }
}

/**
 * useCourseSync - Real-time sync for courses list
 * 
 * Subscribes to courses table changes for the main listing page
 */
export function useCourseSync() {
  const { subscribeToTable, isConnected } = useRealtime()
  const courseStore = useCourseStore()

  const handleCourseChange = useCallback((payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload

    console.log('[CourseSync] Received:', eventType, newRecord || oldRecord)

    const currentCourses = courseStore.courses
    let updatedCourses = [...currentCourses]

    switch (eventType) {
      case 'INSERT':
        if (!updatedCourses.find(c => c.id === newRecord.id)) {
          updatedCourses.push(newRecord)
        }
        break
        
      case 'UPDATE':
        const updateIndex = updatedCourses.findIndex(c => c.id === newRecord.id)
        if (updateIndex !== -1) {
          updatedCourses[updateIndex] = { ...updatedCourses[updateIndex], ...newRecord }
        }
        break
        
      case 'DELETE':
        updatedCourses = updatedCourses.filter(c => c.id !== oldRecord.id)
        break
    }

    courseStore.setCourses(updatedCourses)
  }, [courseStore])

  useEffect(() => {
    if (!isConnected) return

    console.log('[CourseSync] Subscribing to courses table')
    
    const unsubscribe = subscribeToTable('courses', handleCourseChange)

    return () => {
      console.log('[CourseSync] Unsubscribing from courses')
      unsubscribe()
    }
  }, [isConnected, subscribeToTable, handleCourseChange])

  return { isConnected }
}
