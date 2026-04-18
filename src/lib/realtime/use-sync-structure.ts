'use client'

export function useStructureSync(courseId: string | null) {
  void courseId
  return { isConnected: false }
}

export function useCourseSync() {
  return { isConnected: false }
}
