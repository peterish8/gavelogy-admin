'use client'

import { createContext, useContext, useEffect } from 'react'
import { useHasUnsavedChanges } from '@/lib/stores/draft-store'

interface DraftContextType {
  hasUnsavedChanges: boolean
}

const DraftContext = createContext<DraftContextType>({
  hasUnsavedChanges: false
})

interface DraftProviderProps {
  children: React.ReactNode
}

// Provides a simple context wrapper for the save-bar dirty state used across admin pages.
export function DraftProvider({ children }: DraftProviderProps) {
  const hasUnsavedChanges = useHasUnsavedChanges()

  // Warns before a browser/tab close when the draft store still has unsaved changes.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        // Modern browsers show a generic message, not this custom one
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [hasUnsavedChanges])

  return (
    <DraftContext.Provider value={{ hasUnsavedChanges }}>
      {children}
    </DraftContext.Provider>
  )
}

// Reads the current draft context and guards against usage outside DraftProvider.
export function useDraft() {
  const context = useContext(DraftContext)
  if (!context) {
    throw new Error('useDraft must be used within a DraftProvider')
  }
  return context
}

// Re-exports the underlying draft store helpers so most consumers can import from one place.
export { useDraftStore, useHasUnsavedChanges, useSaveBar } from '@/lib/stores/draft-store'
