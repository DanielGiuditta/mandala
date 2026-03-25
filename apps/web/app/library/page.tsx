import { listLibraryDocuments } from "@mandala/db"

import { getViewerRequestContext } from "../../lib/auth/session"
import { LibraryFiltersForm } from "./library-filters-form"

interface LibraryPageProps {
  searchParams: Promise<{
    category?: string
    q?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const params = await searchParams
  const viewerContext = await getViewerRequestContext()
  const filters = {
    category: params.category || undefined,
    query: params.q || undefined,
  }
  const data = await listLibraryDocuments(filters, viewerContext)

  return (
    <main className="stack">
      <section className="card">
        <div className="page-title">
          <div>
            <h2>Library</h2>
            <p className="muted">
              Shared documents where <code>projectId</code> is null.
            </p>
            {data.viewerLabel ? <p className="muted">Viewer: {data.viewerLabel}</p> : null}
          </div>
        </div>

        {!data.configured && data.configMessage ? (
          <div className="notice">{data.configMessage}</div>
        ) : null}
        {data.accessMessage ? <div className="notice">{data.accessMessage}</div> : null}

        {data.forbidden ? (
          <div className="empty-state">The shared library is available to internal users only.</div>
        ) : (
          <LibraryFiltersForm
            categories={data.categories}
            category={data.filters.category ?? ""}
            query={data.filters.query ?? ""}
          />
        )}
      </section>

      {!data.forbidden ? (
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Document</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Uploaded by</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {data.documents.length === 0 ? (
                  <tr>
                    <td className="muted" colSpan={5}>
                      {data.configured
                        ? "No shared library documents match the current filters."
                        : "Configure the database connection to load library documents."}
                    </td>
                  </tr>
                ) : null}

                {data.documents.map((document) => (
                  <tr key={document.id}>
                    <td>
                      <a
                        className="inline-link"
                        href={document.fileUrl}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {document.name}
                      </a>
                      {document.description ? (
                        <div className="muted">{document.description}</div>
                      ) : null}
                    </td>
                    <td>{document.category ?? "Uncategorized"}</td>
                    <td>{document.fileType ?? "Unknown type"}</td>
                    <td>{document.uploadedByPersonName ?? "Unknown uploader"}</td>
                    <td>{document.createdAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  )
}
