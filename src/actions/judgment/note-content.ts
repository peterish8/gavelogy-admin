'use server'

import { createClient } from '@supabase/supabase-js'

// Creates a service-role Supabase client for server-side note-content writes.
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Upserts the rendered HTML body for a note item, creating the note_contents row when needed.
export async function saveNoteContent(itemId: string, contentHtml: string): Promise<void> {
  const adminClient = getAdminClient()
  const { error } = await adminClient
    .from('note_contents')
    .upsert(
      { item_id: itemId, content_html: contentHtml },
      { onConflict: 'item_id' }
    )
  if (error) throw error
}

// Stores generated flashcards as JSON on the existing note_contents row for the item.
export async function saveFlashcardsJson(itemId: string, flashcards: { front: string; back: string }[]): Promise<void> {
  const adminClient = getAdminClient()
  const { error } = await adminClient
    .from('note_contents')
    .update({ flashcards_json: JSON.stringify(flashcards), updated_at: new Date().toISOString() })
    .eq('item_id', itemId)
  if (error) throw error
}
