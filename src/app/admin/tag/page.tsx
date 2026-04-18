import { fetchAllCaseItems, fetchLinkCountsForItems } from '@/actions/judgment/links'
import TagCasesClient from './TagCasesClient'

// Server page that loads case items plus link counts for the tagging workspace list.
export default async function TagCasesPage() {
  const cases = await fetchAllCaseItems()
  const linkCounts = await fetchLinkCountsForItems(cases.map((c) => c.id))

  return (
    <TagCasesClient cases={cases} linkCounts={linkCounts} />
  )
}
