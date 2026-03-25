import { getViewerRequestContext } from "../../lib/auth/session"
import { PeopleDomainList } from "../components/people-domain-list"
import { createPersonAction, loadPeopleOptionsAction } from "./actions"
import { getCachedPeople } from "./data-cache"

interface PeoplePageProps {
  searchParams: Promise<{
    office?: string
    q?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const params = await searchParams
  const viewerContext = await getViewerRequestContext()
  const filters = {
    officeId: params.office || undefined,
    query: params.q || undefined,
  }
  const data = await getCachedPeople(filters, viewerContext)

  return (
    <main className="stack">
      <PeopleDomainList
        data={data}
        loadSupervisorOptionsAction={loadPeopleOptionsAction}
        onCreatePersonAction={createPersonAction}
      />
    </main>
  )
}
