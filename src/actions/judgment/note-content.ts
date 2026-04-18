'use server'

import { fetchMutation } from 'convex/nextjs'
import { convexAuthNextjsToken } from '@convex-dev/auth/nextjs/server'
import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'

export async function saveNoteContent(itemId: string, contentHtml: string): Promise<void> {
  const token = await convexAuthNextjsToken()
  await fetchMutation(
    api.content.updateNoteContent,
    {
      itemId: itemId as Id<'structure_items'>,
      content_html: contentHtml,
    },
    token ? { token } : undefined
  )
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function saveFlashcardsJson(_itemId: string, _flashcards: { front: string; back: string }[]): Promise<void> {
  throw new Error('Flashcard persistence has not been added to the shared Convex backend yet.')
}
