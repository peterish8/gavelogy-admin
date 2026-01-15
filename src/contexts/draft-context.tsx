'use client'

import { createContext, useContext, useEffect, useCallback } from 'react'
import { useDraftStore, useHasUnsavedChanges } from '@/lib/stores/draft-store'

interface DraftContextType {
  hasUnsavedChanges: boolean
}

const DraftContext = createContext<DraftContextType>({
  hasUnsavedChanges: false
})

interface DraftProviderProps {
  children: React.ReactNode
}

export function DraftProvider({ children }: DraftProviderProps) {
  const hasUnsavedChanges = useHasUnsavedChanges()

  // Add beforeunload warning when there are unsaved changes
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

export function useDraft() {
  const context = useContext(DraftContext)
  if (!context) {
    throw new Error('useDraft must be used within a DraftProvider')
  }
  return context
}

// Re-export the store hooks for convenience
export { useDraftStore, useHasUnsavedChanges, useSaveBar } from '@/lib/stores/draft-store'
