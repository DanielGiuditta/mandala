import Link from "next/link"

import { listProjects } from "@mandala/db"
import { PROJECT_STAGES, isProjectStage } from "@mandala/domain"

interface ProjectsPageProps {
  searchParams: Promise<{
    office?: string
    q?: string
    stage?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const params = await searchParams
  const filters = {
    officeId: params.office || undefined,
    query: params.q || undefined,
    stage: params.stage && isProjectStage(params.stage) ? params.stage : undefined,
  }
  const data = await listProjects(filters)

  return (
    <main className="stack">
      <section className="card">
        <div className="page-title">
          <div>
            <h2>Projects</h2>
            <p className="muted">
              Bare-bones working surface for the first vertical slice. Visual design can land
              later without changing the query layer.
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
                placeholder="Project or client"
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

            <label>
              Stage
              <select defaultValue={data.filters.stage ?? ""} name="stage">
                <option value="">All stages</option>
                {PROJECT_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stage}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="button-row">
            <button type="submit">Apply filters</button>
            <Link className="secondary" href="/projects">
              Reset
            </Link>
          </div>
        </form>
      </section>

      <section className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Stage</th>
                <th>Originating office</th>
                <th>Managing office</th>
                <th>Lead</th>
                <th>Target completion</th>
              </tr>
            </thead>
            <tbody>
              {data.projects.length === 0 ? (
                <tr>
                  <td className="muted" colSpan={7}>
                    {data.configured
                      ? "No projects match the current filters."
                      : "Configure the database connection to load projects."}
                  </td>
                </tr>
              ) : null}

              {data.projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link href={`/projects/${project.id}`}>{project.name}</Link>
                  </td>
                  <td>{project.clientName ?? "Unassigned"}</td>
                  <td>
                    <span className="pill">{project.stage}</span>
                  </td>
                  <td>{project.originatingOfficeName}</td>
                  <td>{project.managingOfficeName}</td>
                  <td>{project.leadPersonName ?? "No lead"}</td>
                  <td>{project.targetCompletionDate ?? "No target date"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  )
}
