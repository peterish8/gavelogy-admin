'use client'

import { useMemo, useCallback } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { Course } from '@/types/course-builder'

function mapCourse(course: any, index: number): Course {
  return {
    id: course._id,
    name: course.name,
    description: course.description ?? null,
    price: course.price ?? 0,
    is_active: course.is_active ?? false,
    is_crash_course: false,
    icon: '📚',
    order_index: index,
    version: 1,
    created_at: new Date(course._creationTime).toISOString(),
    updated_at: new Date(course._creationTime).toISOString(),
  }
}

export function useCourses() {
  const courses = useQuery(api.admin.getAllCourses, {})

  const mappedCourses = useMemo(
    () => (courses ?? []).map((course: any, index: number) => mapCourse(course, index)),
    [courses]
  )

  return {
    courses: mappedCourses,
    isLoading: courses === undefined,
    isFetching: false,
    error: null,
    refetch: () => {},
  }
}

export function useCourse(courseId: string) {
  const courses = useQuery(api.admin.getAllCourses, {})

  const course = useMemo(() => {
    if (!courses) return null
    const index = courses.findIndex((item: any) => item._id === courseId)
    if (index === -1) return null
    return mapCourse(courses[index], index)
  }, [courseId, courses])

  return {
    course,
    isLoading: courses === undefined,
    error: null,
    refetch: () => {},
  }
}

export function useCourseActions() {
  const allCourses = useQuery(api.admin.getAllCourses, {})
  const upsertCourse = useMutation(api.admin.upsertCourse)
  const removeCourse = useMutation(api.admin.deleteCourse)

  const createCourse = useCallback(async (courseData: Partial<Course>) => {
    return await upsertCourse({
      name: courseData.name || 'New Course',
      description: courseData.description || 'Course description',
      price: courseData.price || 0,
      is_active: courseData.is_active ?? false,
      is_free: false,
    })
  }, [upsertCourse])

  const updateCourse = useCallback(async (courseId: string, updates: Partial<Course>) => {
    const existing = allCourses?.find((course: any) => course._id === courseId)
    if (!existing) throw new Error('Course not found')
    return await upsertCourse({
      courseId: courseId as Id<'courses'>,
      name: updates.name ?? existing.name,
      description: updates.description ?? existing.description,
      price: updates.price ?? existing.price,
      is_active: updates.is_active ?? existing.is_active,
      is_free: existing.is_free,
    })
  }, [allCourses, upsertCourse])

  const deleteCourse = useCallback(async (courseId: string) => {
    await removeCourse({ courseId: courseId as Id<'courses'> })
  }, [removeCourse])

  const reorderCourse = useCallback(async (_courseId: string, _newIndex: number) => {
    // The shared Convex schema does not store explicit course order.
  }, [])

  return { createCourse, updateCourse, deleteCourse, reorderCourse }
}
