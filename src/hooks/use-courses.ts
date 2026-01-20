'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { Course, CourseWithSubjects } from '@/types/course-builder'
import { useDraftStore } from '@/lib/stores/draft-store'
import { useCourseStore } from '@/lib/stores/course-store'

export function useCourses() {
  const store = useCourseStore()
  const [error, setError] = useState<string | null>(null)
  
  // If we have data in store, we are NOT loading from user perspective (Instant Load)
  // unless we want to force a refresh UI (which we usually don't for stale-while-revalidate)
  const isLoaded = store.coursesLoaded
  const [isFetching, setIsFetching] = useState(false)

  const fetchCourses = useCallback(async (force = false) => {
    // If we have data and not forced, strictly speaking we could skip.
    // But usually we want "Stale While Revalidate" -> Show old data, fetch new.
    
    if (isFetching) return
    setIsFetching(true)
    setError(null)
    
    // Safety timeout
    const timeoutId = setTimeout(() => {
        setIsFetching(false)
        console.warn('useCourses: forced timeout')
    }, 5000)
    
    try {
      console.log('useCourses: invoking supabase client')
      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('courses')
        .select('*')
        .order('order_index', { ascending: true })

      if (fetchError) throw fetchError
      
      console.log('useCourses: fetch success', data?.length)
      store.setCourses(data || [])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch courses'
      console.error('useCourses: caught error', message)
      setError(message)
    } finally {
      clearTimeout(timeoutId)
      setIsFetching(false)
    }
  }, [store.setCourses])

  // Initial fetch
  useEffect(() => {
    // Determine if we need to fetch
    // If empty or if it's been a while (optional), or just always "revalidate"
    if (!store.coursesLoaded || store.courses.length === 0) {
        fetchCourses()
    } else {
        // We have data, but let's refresh silently in the background
        fetchCourses()
    }
  }, [fetchCourses, store.coursesLoaded]) // Remove store.courses.length to avoid loops? No, fetchCourses is stable.

  return { 
    courses: store.courses, 
    isLoading: !isLoaded && isFetching, // Only show loading spinner if we have NO data
    error, 
    refetch: () => fetchCourses(true) 
  }
}

export function useCourse(courseId: string) {
  const store = useCourseStore()
  const [error, setError] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  
  const getChangeForEntity = useDraftStore((state) => state.getChangeForEntity)

  // 1. Try to find in cache (from list or details)
  const cachedCourse = store.courses.find(c => c.id === courseId) || store.courseDetails[courseId]
  
  const fetchCourse = useCallback(async () => {
    if (!courseId) return
    
    // If we found it in cache, we assume "good enough" for instant load, 
    // but maybe we want to re-fetch details if it was just a summary? 
    // For now assuming summary is enough or we fetch to be sure.
    
    console.log('useCourse: fetching course', courseId)
    setIsFetching(true)
    setError(null)

    // Safety timeout
    const timeoutId = setTimeout(() => {
        setIsFetching(false)
    }, 5000)

    // 1. Check drafts (unchanged logic)
    const draftChange = getChangeForEntity(courseId)
    if (draftChange && draftChange.entityType === 'course' && draftChange.action === 'create') {
        const draftCourse = {
            ...draftChange.data as Course,
            subjects: []
        }
        // Maybe update store? No, draft is volatile.
        setIsFetching(false)
        clearTimeout(timeoutId)
        return // We return specialized logic below
    }

    // 2. Fetch from Supabase
    try {
      const supabase = createClient()
      const { data: courseData, error: courseError } = await supabase
        .from('courses')
        .select('*')
        .eq('id', courseId)
        .maybeSingle()

      if (courseError) throw courseError
      
      if (courseData) {
          store.setCourseDetail(courseData)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch course'
      setError(message)
    } finally {
      clearTimeout(timeoutId)
      setIsFetching(false)
    }
  }, [courseId, getChangeForEntity, store.setCourseDetail])

  useEffect(() => {
      // If not in cache, strictly fetch. 
      // Even if in cache, re-fetch for updates.
      if (!cachedCourse) {
          fetchCourse()
      } else {
          // Silent re-validate
          fetchCourse()
      }
  }, [courseId, fetchCourse]) // Remove cachedCourse dependency to avoid loops if object splits

  // Logic to return: Cache + Draft Overrides
  const mergedCourse = useMemo(() => {
      // Logic: Start with Cache or Null
      // Warning: draftChange is used in logic but not dependency above? 
      // Just re-calc here.
      
      const draftChange = getChangeForEntity(courseId)
      if (draftChange && draftChange.entityType === 'course' && draftChange.action === 'create') {
          return {
              ...draftChange.data as Course,
              subjects: []
          }
      }
      
      if (!cachedCourse) return null
      
      const base = { ...cachedCourse, subjects: [] }
      if (draftChange && draftChange.action === 'update') {
          Object.assign(base, draftChange.data)
      }
      return base
  }, [cachedCourse, courseId, getChangeForEntity])

  return { 
      course: mergedCourse, 
      isLoading: !mergedCourse && isFetching, // Only load if no data at all
      error, 
      refetch: fetchCourse 
  }
}

// Hook for CRUD operations (uses draft store)
export function useCourseActions() {
  const addChange = useDraftStore((state) => state.addChange)

  const createCourse = useCallback((courseData: Partial<Course>) => {
    const tempId = crypto.randomUUID()
    addChange({
      action: 'create',
      entityType: 'course',
      entityId: tempId,
      data: {
        id: tempId,
        name: courseData.name || 'New Course',
        description: courseData.description || null,
        price: courseData.price || 0,
        icon: courseData.icon || '📚',
        order_index: courseData.order_index || 0,
        is_active: true,
        version: 1,
        ...courseData
      }
    })
    return tempId
  }, [addChange])

  const updateCourse = useCallback((courseId: string, updates: Partial<Course>) => {
    addChange({
      action: 'update',
      entityType: 'course',
      entityId: courseId,
      data: updates
    })
  }, [addChange])

  const deleteCourse = useCallback((courseId: string) => {
    addChange({
      action: 'delete',
      entityType: 'course',
      entityId: courseId,
      data: {}
    })
  }, [addChange])

  const reorderCourse = useCallback((courseId: string, newIndex: number, originalIndex: number) => {
    addChange({
      action: 'reorder',
      entityType: 'course',
      entityId: courseId,
      data: { order_index: newIndex },
      originalData: { order_index: originalIndex }
    })
  }, [addChange])

  return { createCourse, updateCourse, deleteCourse, reorderCourse }
}
