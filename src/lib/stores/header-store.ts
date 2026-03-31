import { create } from 'zustand'
import { ReactNode } from 'react'

interface HeaderStore {
  title: string | ReactNode
  actions: ReactNode | null
  setHeader: (title: string | ReactNode, actions: ReactNode | null) => void
  clearHeader: () => void
}

// Zustand store controlling the shared admin page header — its title and optional toolbar action buttons.
export const useHeaderStore = create<HeaderStore>((set) => ({
  title: '',
  actions: null,
  // Updates the header with a new title and optional action nodes rendered in the toolbar.
  setHeader: (title, actions) => set({ title, actions }),
  // Resets the header to empty; call on page unmount to prevent stale headers.
  clearHeader: () => set({ title: '', actions: null }),
}))
