import { create } from 'zustand'
import { Course } from '@/types/course-builder'
import { StructureItem } from '@/types/structure'

interface CourseStore {
  // Course List Cache
  courses: Course[]
  coursesLoaded: boolean
  lastCoursesFetch: number // Timestamp
  setCourses: (courses: Course[]) => void

  // Specific Course Data Cache
  courseDetails: Record<string, Course>
  setCourseDetail: (course: Course) => void

  // Structure Cache
  structures: Record<string, StructureItem[]>
  setStructure: (courseId: string, items: StructureItem[]) => void

  // Invalidate
  invalidate: () => void

  // Hydration tracking (kept for compatibility but not used without persist)
  _hasHydrated: boolean
  setHasHydrated: (state: boolean) => void
}

// SIMPLIFIED: Removed persist middleware to test if localStorage is causing issues
// In-memory Zustand store for caching course list, individual course details, and structure trees.
export const useCourseStore = create<CourseStore>((set) => ({
  courses: [],
  coursesLoaded: false,
  lastCoursesFetch: 0,
  courseDetails: {},
  structures: {},
  _hasHydrated: true, // Always true without persist

  // Stores the full course list and marks the cache as loaded with a fetch timestamp.
  setCourses: (courses) => set({
    courses,
    coursesLoaded: true,
    lastCoursesFetch: Date.now()
  }),

  // Merges a single course into the courseDetails cache, keyed by course ID.
  setCourseDetail: (course) => set((state) => ({
    courseDetails: { ...state.courseDetails, [course.id]: course }
  })),

  // Stores the flat structure item list for a specific course by its ID.
  setStructure: (courseId, items) => set((state) => ({
    structures: { ...state.structures, [courseId]: items }
  })),

  // Marks the courses cache as stale so the next hook call triggers a fresh fetch.
  invalidate: () => set({
    coursesLoaded: false,
    lastCoursesFetch: 0
  }),

  // No-op stub kept for API compatibility when persist middleware is not active.
  setHasHydrated: () => {}, // No-op without persist
}))
