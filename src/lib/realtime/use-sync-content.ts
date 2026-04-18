'use client'

import { useCallback } from 'react'

export function useDraftContentSync(
  _itemId: string | null,
  _onRemoteChange: (draftData: any, cursorData: any) => void
) {
  return { isConnected: false }
}

export function useAutoSaveDraft(itemId: string | null) {
  const saveDraft = useCallback(async (_content: string, _cursorPosition?: { x: number; y: number }) => {
    if (!itemId) return
  }, [itemId])

  const debouncedSave = useCallback((_content: string, _cursorPosition?: { x: number; y: number }) => {}, [])

  return { saveDraft, debouncedSave }
}
