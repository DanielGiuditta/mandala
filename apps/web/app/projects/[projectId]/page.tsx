import Link from "next/link"
import { notFound } from "next/navigation"

import { getProjectDetail } from "@mandala/db"

interface ProjectDetailPageProps {
  params: Promise<{
    projectId: string
  }>
}

export const dynamic = "force-dynamic"

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value)
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = await params
  const data = await getProjectDetail(projectId)

  if (data.configured && !data.project) {
    notFound()
  }

  return (
    <main className="stack">
      <div className="button-row">
        <Link className="secondary" href="/projects">
          Back to projects
        </Link>
      </div>

      {!data.configured && data.configMessage ? (
        <div className="notice">{data.configMessage}</div>
      ) : null}

      {data.project ? (
        <>
          <section className="card stack">
            <div className="page-title">
              <div>
                <h2>{data.project.name}</h2>
                <p className="muted">
                  {data.project.clientName ?? "No client name"} · {data.project.originatingOfficeName}{" "}
                  origin · {data.project.managingOfficeName} managing office
                </p>
              </div>
              <span className="pill">{data.project.stage}</span>
            </div>

            <div className="detail-grid">
              <div className="card">
                <div className="section-title">
                  <h3>Overview</h3>
                </div>
                <div className="stack">
                  <div>
                    <div className="field-label">Lead</div>
                    <div>{data.project.leadPersonName ?? "No lead assigned"}</div>
                  </div>
                  <div>
                    <div className="field-label">Description</div>
                    <div>{data.project.description ?? "No description"}</div>
                  </div>
                </div>
              </div>

              <div className="card">
                <div className="section-title">
                  <h3>Dates</h3>
                </div>
                <div className="stack">
                  <div>
                    <div className="field-label">Start date</div>
                    <div>{data.project.startDate ?? "No start date"}</div>
                  </div>
                  <div>
                    <div className="field-label">Target completion</div>
                    <div>{data.project.targetCompletionDate ?? "No target date"}</div>
                  </div>
                  <div>
                    <div className="field-label">Status</div>
                    <div>{data.project.active ? "Active" : "Inactive"}</div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="card stack">
            <div className="section-title">
              <h3>Staffing</h3>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Title</th>
                    <th>Home office</th>
                    <th>Hours / week</th>
                    <th>Window</th>
                  </tr>
                </thead>
                <tbody>
                  {data.staffing.length === 0 ? (
                    <tr>
                      <td className="muted" colSpan={5}>
                        No staffing assignments yet.
                      </td>
                    </tr>
                  ) : null}

                  {data.staffing.map((assignment) => (
                    <tr key={assignment.id}>
                      <td>{assignment.personName}</td>
                      <td>{assignment.personTitle ?? "No title"}</td>
                      <td>{assignment.personOfficeName ?? "No office"}</td>
                      <td>{assignment.assignedHoursPerWeek}</td>
                      <td>
                        {assignment.startDate ?? "No start"} to {assignment.endDate ?? "Open"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card stack">
            <div className="section-title">
              <h3>Checklist items</h3>
            </div>
            <ul className="list-reset">
              {data.checklistItems.length === 0 ? (
                <li className="list-item muted">No checklist items yet.</li>
              ) : null}

              {data.checklistItems.map((item) => (
                <li className="list-item" key={item.id}>
                  <strong>
                    {item.completed ? "Completed" : "Open"} · {item.title}
                  </strong>
                  <div className="muted">
                    Assigned to {item.assignedPersonName ?? "nobody"} · Created {item.createdAt}
                    {item.completedAt ? ` · Completed ${item.completedAt}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="card stack">
            <div className="section-title">
              <h3>Project time summary</h3>
            </div>

            <div className="summary-grid">
              <div className="summary-tile">
                <strong>{data.timeSummary.totalHours.toFixed(2)}</strong>
                <span>Total logged hours</span>
              </div>
              <div className="summary-tile">
                <strong>{formatCurrency(data.timeSummary.totalLaborCost)}</strong>
                <span>Rough labor cost to date</span>
              </div>
              <div className="summary-tile">
                <strong>{data.timeSummary.byPerson.length}</strong>
                <span>People with logged time</span>
              </div>
            </div>

            <div className="detail-grid">
              <div className="card">
                <div className="section-title">
                  <h3>Logged hours by person</h3>
                </div>
                <ul className="list-reset">
                  {data.timeSummary.byPerson.length === 0 ? (
                    <li className="list-item muted">No tracked time yet.</li>
                  ) : null}
                  {data.timeSummary.byPerson.map((personSummary) => (
                    <li className="list-item" key={personSummary.personId}>
                      <strong>{personSummary.personName}</strong>
                      <div className="muted">
                        {personSummary.hours.toFixed(2)} hours ·{" "}
                        {formatCurrency(personSummary.laborCost)}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="card">
                <div className="section-title">
                  <h3>Recent time entries</h3>
                </div>
                <ul className="list-reset">
                  {data.timeSummary.recentEntries.length === 0 ? (
                    <li className="list-item muted">No recent entries.</li>
                  ) : null}
                  {data.timeSummary.recentEntries.map((entry) => (
                    <li className="list-item" key={entry.id}>
                      <strong>
                        {entry.personName ?? "Unknown person"} · {entry.hours.toFixed(2)} hours
                      </strong>
                      <div className="muted">
                        {entry.date} · {entry.source ?? "Unknown source"}
                      </div>
                      {entry.notes ? <div>{entry.notes}</div> : null}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          <section className="card stack">
            <div className="section-title">
              <h3>Documents</h3>
            </div>
            <ul className="list-reset">
              {data.documents.length === 0 ? (
                <li className="list-item muted">No project documents yet.</li>
              ) : null}
              {data.documents.map((document) => (
                <li className="list-item" key={document.id}>
                  <strong>
                    <a
                      className="inline-link"
                      href={document.fileUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {document.name}
                    </a>
                  </strong>
                  <div className="muted">
                    {document.category ?? "Uncategorized"} · {document.fileType ?? "Unknown type"} ·{" "}
                    {document.createdAt}
                  </div>
                  {document.description ? <div>{document.description}</div> : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <section className="card">
          <h2>Project detail</h2>
          <p className="muted">
            Configure the database connection to load live project detail data.
          </p>
        </section>
      )}
    </main>
  )
}
