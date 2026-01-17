import { create } from 'zustand'

/**
 * Local Content Cache Store
 * 
 * Stores unsaved content changes in memory when switching between files.
 * Content Flow:
 * 1. User edits content → Stored in localContentCache (this store)
 * 2. User clicks "Save Draft" → Content saved to draft_content_cache table
 * 3. User clicks "Publish" → Content moved to note_contents table (visible to users)
 */

interface LocalContentCache {
  // Map of itemId -> unsaved content (HTML format)
  noteContent: Record<string, string>
  quizContent: Record<string, string>
  
  // Actions
  setNoteContent: (itemId: string, content: string) => void
  setQuizContent: (itemId: string, content: string) => void
  getNoteContent: (itemId: string) => string | undefined
  getQuizContent: (itemId: string) => string | undefined
  clearContent: (itemId: string) => void
  clearAllContent: () => void
  hasUnsavedContent: (itemId: string) => boolean
}

export const useLocalContentCache = create<LocalContentCache>((set, get) => ({
  noteContent: {},
  quizContent: {},

  setNoteContent: (itemId, content) => set((state) => ({
    noteContent: { ...state.noteContent, [itemId]: content }
  })),

  setQuizContent: (itemId, content) => set((state) => ({
    quizContent: { ...state.quizContent, [itemId]: content }
  })),

  getNoteContent: (itemId) => {
    return get().noteContent[itemId]
  },

  getQuizContent: (itemId) => {
    return get().quizContent[itemId]
  },

  clearContent: (itemId) => set((state) => {
    const { [itemId]: removedNote, ...restNote } = state.noteContent
    const { [itemId]: removedQuiz, ...restQuiz } = state.quizContent
    return {
      noteContent: restNote,
      quizContent: restQuiz
    }
  }),

  clearAllContent: () => set({
    noteContent: {},
    quizContent: {}
  }),

  hasUnsavedContent: (itemId) => {
    const state = get()
    return !!(state.noteContent[itemId] || state.quizContent[itemId])
  }
}))
