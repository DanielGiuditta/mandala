import Link from "next/link"

import { listPeople } from "@mandala/db"

import { getViewerRequestContext } from "../../lib/auth/session"

interface PeoplePageProps {
  searchParams: Promise<{
    office?: string
    q?: string
  }>
}

export const dynamic = "force-dynamic"

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value)
}

export default async function PeoplePage({ searchParams }: PeoplePageProps) {
  const params = await searchParams
  const viewerContext = await getViewerRequestContext()
  const filters = {
    officeId: params.office || undefined,
    query: params.q || undefined,
  }
  const data = await listPeople(filters, viewerContext)

  return (
    <main className="stack">
      <section className="card">
        <div className="page-title">
          <div>
            <h2>People</h2>
            <p className="muted">
              Directory and capacity context based on the documented Person entity and active
              assignment totals.
            </p>
            {data.viewerLabel ? <p className="muted">Viewer: {data.viewerLabel}</p> : null}
          </div>
        </div>

        {!data.configured && data.configMessage ? (
          <div className="notice">{data.configMessage}</div>
        ) : null}
        {data.accessMessage ? <div className="notice">{data.accessMessage}</div> : null}

        {data.forbidden ? (
          <div className="empty-state">People access is limited to partners and scoped admins.</div>
        ) : (
          <form className="stack" method="get">
            <div className="filters">
              <label>
                Search
                <input
                  defaultValue={data.filters.query ?? ""}
                  name="q"
                  placeholder="Name, title, or email"
                  type="search"
                />
              </label>

              <label>
                Office
                <select defaultValue={data.filters.officeId ?? ""} name="office">
                  <option value="">All offices</option>
                  {data.offices.map((office) => (
                    <option key={office.id} value={office.id}>
                      {office.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="button-row">
              <button type="submit">Apply filters</button>
              <a className="secondary" href="/people">
                Reset
              </a>
            </div>
          </form>
        )}
      </section>

      {!data.forbidden ? (
        <section className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Title</th>
                  <th>Office</th>
                  <th>Availability / week</th>
                  <th>Assigned / week</th>
                  <th>Remaining</th>
                  <th>Annual salary</th>
                  <th>Hourly cost</th>
                </tr>
              </thead>
              <tbody>
                {data.people.length === 0 ? (
                  <tr>
                    <td className="muted" colSpan={8}>
                      {data.configured
                        ? "No people match the current filters."
                        : "Configure the database connection to load people."}
                    </td>
                  </tr>
                ) : null}

                {data.people.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <Link href={`/people/${person.id}`}>{person.fullName}</Link>
                      {!person.active ? <span className="muted"> · inactive</span> : null}
                    </td>
                    <td>{person.title ?? "No title"}</td>
                    <td>{person.officeName}</td>
                    <td>{person.availabilityHoursPerWeek.toFixed(2)}</td>
                    <td>{person.assignedHours.toFixed(2)}</td>
                    <td>{person.remainingCapacity.toFixed(2)}</td>
                    <td>{formatCurrency(person.annualSalary)}</td>
                    <td>{formatCurrency(person.hourlyCost)}</td>
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
