import { createPerfTrace } from "@mandala/db"

import { getViewerRequestContext } from "../../lib/auth/session"
import { ResourcesDomainList } from "../components/resources-domain-list"
import { getCachedLibraryDocuments } from "./data-cache"

interface LibraryPageProps {
  searchParams: Promise<{
    q?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const trace = createPerfTrace("app.library.page")
  const params = await trace.measure("resolveSearchParams", () => searchParams)
  const viewerContext = await trace.measure("getViewerRequestContext", () =>
    getViewerRequestContext(),
  )
  const filters = {
    query: params.q || undefined,
  }
  const data = await trace.measure("getCachedLibraryDocuments", () =>
    getCachedLibraryDocuments(filters, viewerContext),
  )

  trace.finish({
    documentCount: data.documents.length,
    forbidden: data.forbidden,
    hasQuery: Boolean(filters.query),
    result: "ok",
  })

  return (
    <main className="stack">
      <ResourcesDomainList data={data} />
    </main>
  )
}
