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
    
    // Safety timeout (increased to 30s)
    const timeoutId = setTimeout(() => {
        setIsFetching(false)
        console.warn('useCourses: forced timeout')
        setError('Connection timed out. Please check your internet or try again.')
    }, 30000)
    
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
    // Always fetch on mount to ensure freshness, store handles diffing.
    // This fixes the issue where navigating back might show stale/empty state if store was reset or dehydrated.
    fetchCourses()
  }, [fetchCourses])

  return { 
    courses: store.courses, 
    isLoading: !isLoaded && isFetching, // Only show FULL loading spinner if we have NO data
    isFetching, // Allow showing subtle "syncing" indicator
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

    // Safety timeout (increased to 30s)
    const timeoutId = setTimeout(() => {
        setIsFetching(false)
        setError('Connection timed out. Please check your internet or try again.')
    }, 30000)

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
// Hook for CRUD operations (Direct DB - Instant Save)
export function useCourseActions() {
    // Note: create and delete are now handled directly in page.tsx for better optimistic control
    // taking them out here or keeping them as legacy wrappers isn't ideal. 
    // Let's refactor to keep logic central if possible, but for Page's specific needs we did inline.
    // For consistency, let's make these powerful async functions too.

  const createCourse = useCallback(async (courseData: Partial<Course>) => {
      // NOTE: This is used by some components, better to have a central async version
      const supabase = createClient()
      const tempId = crypto.randomUUID()
      const newCourse = {
        id: tempId,
        name: courseData.name || 'New Course',
        description: courseData.description || null,
        price: courseData.price || 0,
        icon: courseData.icon || '📚',
        order_index: courseData.order_index || 0,
        is_active: false,
        version: 1,
        ...courseData,
        updated_at: new Date().toISOString()
      }
      
      const { error } = await supabase.from('courses').insert(newCourse)
      if (error) throw error
      return tempId
  }, [])

  const updateCourse = useCallback(async (courseId: string, updates: Partial<Course>) => {
    try {
        const supabase = createClient()
        const { error } = await supabase
            .from('courses')
            .update(updates)
            .eq('id', courseId)
        
        if (error) throw error
        // Toast handled by caller usually, but for instant save:
        // toast.success('Saved') // Too spammy for every character?
    } catch (e) {
        console.error('Failed to update course', e)
        // toast.error('Failed to save')
        throw e
    }
  }, [])

  const deleteCourse = useCallback(async (courseId: string) => {
      const supabase = createClient()
      const { error } = await supabase.from('courses').delete().eq('id', courseId)
      if (error) throw error
  }, [])

  const reorderCourse = useCallback(async (courseId: string, newIndex: number) => {
    try {
       const supabase = createClient()
       const { error } = await supabase
        .from('courses')
        .update({ order_index: newIndex })
        .eq('id', courseId)
       
       if (error) throw error
    } catch (e) {
        console.error('Failed to reorder', e)
        throw e
    }
  }, [])

  return { createCourse, updateCourse, deleteCourse, reorderCourse }
}
