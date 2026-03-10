import { listLibraryDocuments } from "@mandala/db"

interface LibraryPageProps {
  searchParams: Promise<{
    category?: string
    q?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function LibraryPage({ searchParams }: LibraryPageProps) {
  const params = await searchParams
  const filters = {
    category: params.category || undefined,
    query: params.q || undefined,
  }
  const data = await listLibraryDocuments(filters)

  return (
    <main className="stack">
      <section className="card">
        <div className="page-title">
          <div>
            <h2>Library</h2>
            <p className="muted">
              Shared documents where <code>projectId</code> is null.
            </p>
          </div>
        </div>

        {!data.configured && data.configMessage ? (
          <div className="notice">{data.configMessage}</div>
        ) : null}

        <form className="stack" method="get">
          <div className="filters">
            <label>
              Search
              <input
                defaultValue={data.filters.query ?? ""}
                name="q"
                placeholder="Document name or category"
                type="search"
              />
            </label>

            <label>
              Category
              <select defaultValue={data.filters.category ?? ""} name="category">
                <option value="">All categories</option>
                {data.categories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="button-row">
            <button type="submit">Apply filters</button>
            <a className="secondary" href="/library">
              Reset
            </a>
          </div>
        </form>
      </section>

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
                    {document.description ? <div className="muted">{document.description}</div> : null}
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
    </main>
  )
}
