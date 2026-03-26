import { createPerfTrace } from "@mandala/db"

import { getViewerRequestContext } from "../../lib/auth/session"
import { PeopleDomainList } from "../components/people-domain-list"
import {
  createPersonAction,
  loadPeopleOptionsAction,
  updatePersonAction,
} from "./actions"
import { getCachedPeople } from "./data-cache"

interface PeoplePageProps {
  searchParams: Promise<{
    office?: string
    q?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const trace = createPerfTrace("app.people.page")
  const params = await trace.measure("resolveSearchParams", () => searchParams)
  const viewerContext = await trace.measure("getViewerRequestContext", () =>
    getViewerRequestContext(),
  )
  const filters = {
    officeId: params.office || undefined,
    query: params.q || undefined,
  }
  const data = await trace.measure("getCachedPeople", () =>
    getCachedPeople(filters, viewerContext),
  )

  trace.finish({
    forbidden: data.forbidden,
    hasOfficeFilter: Boolean(filters.officeId),
    hasQuery: Boolean(filters.query),
    personCount: data.people.length,
    result: "ok",
  })

  return (
    <main className="stack">
      <PeopleDomainList
        data={data}
        loadSupervisorOptionsAction={loadPeopleOptionsAction}
        onCreatePersonAction={createPersonAction}
        onUpdatePersonAction={updatePersonAction}
      />
    </main>
  )
}
