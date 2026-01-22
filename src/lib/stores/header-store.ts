import { create } from 'zustand'
import { ReactNode } from 'react'

interface HeaderStore {
  title: string | ReactNode
  actions: ReactNode | null
  setHeader: (title: string | ReactNode, actions: ReactNode | null) => void
  clearHeader: () => void
}

export const useHeaderStore = create<HeaderStore>((set) => ({
  title: '',
  actions: null,
  setHeader: (title, actions) => set({ title, actions }),
  clearHeader: () => set({ title: '', actions: null }),
}))
