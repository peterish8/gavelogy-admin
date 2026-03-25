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
  // Map of itemId -> ISO timestamp when the cache entry was last written
  noteContentSavedAt: Record<string, string>

  // Actions
  setNoteContent: (itemId: string, content: string) => void
  setQuizContent: (itemId: string, content: string) => void
  getNoteContent: (itemId: string) => string | undefined
  getNoteContentSavedAt: (itemId: string) => string | undefined
  getQuizContent: (itemId: string) => string | undefined
  clearContent: (itemId: string) => void
  clearAllContent: () => void
  hasUnsavedContent: (itemId: string) => boolean
}

import { persist, createJSONStorage } from 'zustand/middleware'

// Persisted Zustand store (localStorage) that keeps unsaved note/quiz HTML content while switching between items.
export const useLocalContentCache = create<LocalContentCache>()(
  persist(
    (set, get) => ({
      noteContent: {},
      quizContent: {},
      noteContentSavedAt: {},

      // Stores the unsaved note HTML for a specific content item ID.
      setNoteContent: (itemId, content) => set((state) => ({
        noteContent: { ...state.noteContent, [itemId]: content },
        noteContentSavedAt: { ...state.noteContentSavedAt, [itemId]: new Date().toISOString() },
      })),

      // Stores the unsaved quiz/editor payload for a specific content item ID.
      setQuizContent: (itemId, content) => set((state) => ({
        quizContent: { ...state.quizContent, [itemId]: content }
      })),

      // Returns the cached note HTML for the item if one has been stored locally.
      getNoteContent: (itemId) => {
        return get().noteContent[itemId]
      },

      // Returns when this item's local cache was last written (ISO string).
      getNoteContentSavedAt: (itemId) => {
        return get().noteContentSavedAt[itemId]
      },

      // Returns the cached quiz content for the item if one exists.
      getQuizContent: (itemId) => {
        return get().quizContent[itemId]
      },

      // Clears both note and quiz cache entries for a single item after save/publish.
      clearContent: (itemId) => set((state) => {
        const restNote = { ...state.noteContent }
        delete restNote[itemId]
        const restQuiz = { ...state.quizContent }
        delete restQuiz[itemId]
        const restSavedAt = { ...state.noteContentSavedAt }
        delete restSavedAt[itemId]
        return {
          noteContent: restNote,
          quizContent: restQuiz,
          noteContentSavedAt: restSavedAt,
        }
      }),

      // Resets the entire local unsaved-content cache across all items.
      clearAllContent: () => set({
        noteContent: {},
        quizContent: {},
        noteContentSavedAt: {},
      }),

      // Checks whether either note or quiz content is currently cached for this item.
      hasUnsavedContent: (itemId) => {
        const state = get()
        return !!(state.noteContent[itemId] || state.quizContent[itemId])
      }
    }),
    {
      name: 'gavelogy-local-content-cache', // unique name
      storage: createJSONStorage(() => localStorage),
    }
  )
)
