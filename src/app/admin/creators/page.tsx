import CreatorsClient from './creators-client'
import { fetchQuery } from 'convex/nextjs'
import { api } from '@convex/_generated/api'

export default async function CreatorsPage() {
  const revenueData = await fetchQuery(api.adminQueries.getRevenueDashboard, {})
  return <CreatorsClient initialData={revenueData} />
}
