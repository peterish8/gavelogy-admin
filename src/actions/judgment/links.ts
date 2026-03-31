'use server'

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

// Creates a service-role client for judgment-link mutations that should bypass end-user RLS restrictions.
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface NotePdfLink {
  id: string
  item_id: string
  link_id: string
  pdf_page: number
  x: number
  y: number
  width: number
  height: number
  label: string | null
  created_at: string
}

export interface CaseItem {
  id: string
  title: string
  item_type: string
  pdf_url: string | null
  created_at: string
}

// Fetches all PDF highlight/link records attached to one note or judgment item.
export async function fetchLinksForItem(itemId: string): Promise<NotePdfLink[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('note_pdf_links')
    .select('*')
    .eq('item_id', itemId)
    .order('created_at')
  if (error) throw error
  return data || []
}

// Checks whether the given structure item currently has a PDF URL attached.
export async function checkItemHasPdf(itemId: string): Promise<string | null> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('structure_items')
    .select('pdf_url')
    .eq('id', itemId)
    .single()
  if (error || !data) return null
  return (data as any).pdf_url || null
}

// Inserts a new PDF highlight/link rectangle for an item and returns the saved row.
export async function insertLink(payload: {
  item_id: string
  link_id: string
  pdf_page: number
  x: number
  y: number
  width: number
  height: number
  label?: string
}): Promise<NotePdfLink> {
  const adminClient = getAdminClient()
  const { data, error } = await adminClient
    .from('note_pdf_links')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return data
}

// Renames the label attached to an existing PDF link record.
export async function updateLinkLabel(id: string, label: string): Promise<void> {
  const adminClient = getAdminClient()
  const { error } = await adminClient
    .from('note_pdf_links')
    .update({ label })
    .eq('id', id)
  if (error) throw error
}

// Deletes a single PDF link/highlight record by its ID.
export async function deleteLink(id: string): Promise<void> {
  const adminClient = getAdminClient()
  const { error } = await adminClient
    .from('note_pdf_links')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// Stores the uploaded PDF URL on the owning structure item.
export async function updateItemPdfUrl(itemId: string, pdfUrl: string): Promise<void> {
  const adminClient = getAdminClient()
  const { error } = await adminClient
    .from('structure_items')
    .update({ pdf_url: pdfUrl })
    .eq('id', itemId)
  if (error) throw error
}

// Fetches structure items that look like case records for the tagging/linking admin flows.
export async function fetchAllCaseItems(): Promise<CaseItem[]> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('structure_items')
    .select('id, title, item_type, pdf_url, created_at')
    .or('title.ilike.CS-%,title.ilike.CQ-%,title.ilike.CR-%')
    .order('title')
  if (error) throw error
  return (data || []) as CaseItem[]
}

// Clears the PDF URL from a structure item without deleting the item itself.
export async function clearItemPdfUrl(itemId: string): Promise<void> {
  const adminClient = getAdminClient()
  const { error } = await adminClient
    .from('structure_items')
    .update({ pdf_url: null })
    .eq('id', itemId)
  if (error) throw error
}

// Returns per-item link counts via RPC so list views can show badges without fetching every link row.
export async function fetchLinkCountsForItems(
  itemIds: string[]
): Promise<Record<string, number>> {
  if (itemIds.length === 0) return {}
  const supabase = await createServerClient()
  // Uses a Postgres RPC (get_link_counts.sql) to aggregate server-side
  // instead of fetching all rows and counting in JS
  const { data, error } = await supabase.rpc('get_link_counts', { item_ids: itemIds })
  if (error) return {}
  const counts: Record<string, number> = {}
  for (const row of data || []) {
    counts[row.item_id] = Number(row.link_count)
  }
  return counts
}
