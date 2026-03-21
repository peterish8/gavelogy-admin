'use server'

import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

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
