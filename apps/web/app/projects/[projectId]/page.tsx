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

function formatDate(value?: string | null): string {
  if (!value) {
    return "Not set"
  }

  const date = value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value)

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date)
}

function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Not set"
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value))
}

function formatHours(value: number): string {
  return `${value.toFixed(1)} hrs`
}

function formatSource(source?: string | null): string {
  if (source === "windows-tracker") {
    return "Windows checker"
  }

  if (source === "manual") {
    return "Manual"
  }

  return "Unknown source"
}

function formatStage(stage: string): string {
  if (stage === "onHold") {
    return "On hold"
  }

  return stage.charAt(0).toUpperCase() + stage.slice(1)
}

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = await params
  const data = await getProjectDetail(projectId)

  if (data.configured && !data.project) {
    notFound()
  }

  const openChecklistItems = data.checklistItems.filter((item) => !item.completed)
  const completedChecklistItems = data.checklistItems.filter((item) => item.completed)
  const plannedHoursPerWeek = data.staffing.reduce(
    (total, assignment) => total + assignment.assignedHoursPerWeek,
    0,
  )

  return (
    <main className="project-detail-page stack">
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
          <section className="card project-hero stack">
            <div className="project-hero-top">
              <div className="stack">
                <div className="project-kicker">Project detail</div>
                <div className="project-title-row">
                  <div className="stack project-title-block">
                    <h2 className="project-title">{data.project.name}</h2>
                    <p className="project-subtitle">
                      {data.project.clientName ?? "No client name"} ·{" "}
                      {data.project.originatingOfficeName} origin ·{" "}
                      {data.project.managingOfficeName} managing office
                    </p>
                  </div>

                  <div className="project-badge-row">
                    <span className="pill project-stage-pill">
                      {formatStage(data.project.stage)}
                    </span>
                    <span className="pill project-status-pill">
                      {data.project.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                <p className="project-description-copy">
                  {data.project.description ??
                    "No description has been added to this project yet."}
                </p>
              </div>

              <div className="project-facts-grid">
                <div className="project-fact">
                  <span className="project-fact-label">Lead</span>
                  <strong className="project-fact-value">
                    {data.project.leadPersonName ?? "No lead assigned"}
                  </strong>
                </div>
                <div className="project-fact">
                  <span className="project-fact-label">Start date</span>
                  <strong className="project-fact-value">
                    {formatDate(data.project.startDate)}
                  </strong>
                </div>
                <div className="project-fact">
                  <span className="project-fact-label">Target completion</span>
                  <strong className="project-fact-value">
                    {formatDate(data.project.targetCompletionDate)}
                  </strong>
                </div>
                <div className="project-fact">
                  <span className="project-fact-label">Originating office</span>
                  <strong className="project-fact-value">
                    {data.project.originatingOfficeName}
                  </strong>
                </div>
                <div className="project-fact">
                  <span className="project-fact-label">Managing office</span>
                  <strong className="project-fact-value">
                    {data.project.managingOfficeName}
                  </strong>
                </div>
              </div>
            </div>

            <nav aria-label="Project sections" className="project-section-nav">
              <a href="#overview">Overview</a>
              <a href="#staffing">Staffing</a>
              <a href="#checklist">Checklist</a>
              <a href="#time">Project time</a>
              <a href="#documents">Documents</a>
            </nav>

            <div className="project-stat-grid">
              <div className="project-stat-card">
                <span className="project-stat-label">Staffed people</span>
                <strong className="project-stat-value">{data.staffing.length}</strong>
              </div>
              <div className="project-stat-card">
                <span className="project-stat-label">Planned hours / week</span>
                <strong className="project-stat-value">{formatHours(plannedHoursPerWeek)}</strong>
              </div>
              <div className="project-stat-card">
                <span className="project-stat-label">Open checklist items</span>
                <strong className="project-stat-value">{openChecklistItems.length}</strong>
              </div>
              <div className="project-stat-card">
                <span className="project-stat-label">Logged hours</span>
                <strong className="project-stat-value">
                  {formatHours(data.timeSummary.totalHours)}
                </strong>
              </div>
              <div className="project-stat-card">
                <span className="project-stat-label">Rough labor cost</span>
                <strong className="project-stat-value">
                  {formatCurrency(data.timeSummary.totalLaborCost)}
                </strong>
              </div>
            </div>
          </section>

          <div className="project-layout">
            <div className="project-main stack">
              <section className="card stack" id="overview">
                <div className="section-heading">
                  <div>
                    <div className="section-kicker">Overview</div>
                    <h3>Project summary</h3>
                  </div>
                  <p className="muted">
                    Core record details and office relationships for this project.
                  </p>
                </div>

                <div className="project-overview-grid">
                  <article className="project-panel project-panel-strong">
                    <div className="section-label">Description</div>
                    <p className="project-panel-copy">
                      {data.project.description ??
                        "No description has been recorded yet. This block is a good candidate for a project narrative or internal summary."}
                    </p>
                  </article>

                  <article className="project-panel">
                    <div className="section-label">Delivery details</div>
                    <dl className="data-pairs">
                      <div>
                        <dt>Client</dt>
                        <dd>{data.project.clientName ?? "No client name"}</dd>
                      </div>
                      <div>
                        <dt>Stage</dt>
                        <dd>{formatStage(data.project.stage)}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{data.project.active ? "Active" : "Inactive"}</dd>
                      </div>
                      <div>
                        <dt>Lead</dt>
                        <dd>{data.project.leadPersonName ?? "No lead assigned"}</dd>
                      </div>
                      <div>
                        <dt>Start date</dt>
                        <dd>{formatDate(data.project.startDate)}</dd>
                      </div>
                      <div>
                        <dt>Target completion</dt>
                        <dd>{formatDate(data.project.targetCompletionDate)}</dd>
                      </div>
                    </dl>
                  </article>

                  <article className="project-panel">
                    <div className="section-label">Office relationship</div>
                    <p className="project-panel-copy">
                      {data.project.originatingOfficeName} originated this project.{" "}
                      {data.project.managingOfficeName} currently manages delivery, staffing,
                      and cost visibility.
                    </p>
                  </article>
                </div>
              </section>

              <section className="card stack" id="staffing">
                <div className="section-heading">
                  <div>
                    <div className="section-kicker">Staffing</div>
                    <h3>Assigned people</h3>
                  </div>
                  <p className="muted">
                    {data.staffing.length} people staffed for {formatHours(plannedHoursPerWeek)}{" "}
                    per week.
                  </p>
                </div>

                {data.staffing.length === 0 ? (
                  <div className="empty-state">No staffing assignments yet.</div>
                ) : (
                  <div className="stack">
                    {data.staffing.map((assignment) => (
                      <article className="project-row-card" key={assignment.id}>
                        <div className="project-row-top">
                          <div>
                            <h4>{assignment.personName}</h4>
                            <p className="muted">
                              {assignment.personTitle ?? "No title"} ·{" "}
                              {assignment.personOfficeName ?? "No office"}
                            </p>
                          </div>
                          <div className="project-row-chip">
                            {formatHours(assignment.assignedHoursPerWeek)} / week
                          </div>
                        </div>

                        <div className="project-row-meta">
                          <span>
                            {formatDate(assignment.startDate)} to{" "}
                            {assignment.endDate ? formatDate(assignment.endDate) : "Open"}
                          </span>
                          <span>{assignment.active ? "Active assignment" : "Inactive"}</span>
                        </div>

                        {assignment.notes ? (
                          <p className="project-row-notes">{assignment.notes}</p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>

              <section className="card stack" id="checklist">
                <div className="section-heading">
                  <div>
                    <div className="section-kicker">Checklist</div>
                    <h3>Project to-dos</h3>
                  </div>
                  <p className="muted">
                    {openChecklistItems.length} open · {completedChecklistItems.length} completed
                  </p>
                </div>

                <div className="project-checklist-grid">
                  <div className="stack">
                    <div className="project-column-header">
                      <span>Open items</span>
                      <span>{openChecklistItems.length}</span>
                    </div>

                    {openChecklistItems.length === 0 ? (
                      <div className="empty-state">No open checklist items.</div>
                    ) : (
                      openChecklistItems.map((item) => (
                        <article className="project-checklist-item" key={item.id}>
                          <div className="project-checklist-top">
                            <h4>{item.title}</h4>
                            <span className="pill project-open-pill">Open</span>
                          </div>
                          <div className="project-checklist-meta">
                            <span>Assigned to {item.assignedPersonName ?? "nobody"}</span>
                            <span>Created {formatDateTime(item.createdAt)}</span>
                          </div>
                        </article>
                      ))
                    )}
                  </div>

                  <div className="stack">
                    <div className="project-column-header">
                      <span>Completed</span>
                      <span>{completedChecklistItems.length}</span>
                    </div>

                    {completedChecklistItems.length === 0 ? (
                      <div className="empty-state">No completed checklist items yet.</div>
                    ) : (
                      completedChecklistItems.map((item) => (
                        <article
                          className="project-checklist-item project-checklist-item-complete"
                          key={item.id}
                        >
                          <div className="project-checklist-top">
                            <h4>{item.title}</h4>
                            <span className="pill project-complete-pill">Completed</span>
                          </div>
                          <div className="project-checklist-meta">
                            <span>Assigned to {item.assignedPersonName ?? "nobody"}</span>
                            <span>Completed {formatDateTime(item.completedAt)}</span>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </section>

              <section className="card stack" id="documents">
                <div className="section-heading">
                  <div>
                    <div className="section-kicker">Documents</div>
                    <h3>Project files</h3>
                  </div>
                  <p className="muted">{data.documents.length} attached to this project.</p>
                </div>

                {data.documents.length === 0 ? (
                  <div className="empty-state">No project documents yet.</div>
                ) : (
                  <div className="stack">
                    {data.documents.map((document) => (
                      <article className="project-row-card" key={document.id}>
                        <div className="project-row-top">
                          <div>
                            <h4>
                              <a
                                className="inline-link"
                                href={document.fileUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {document.name}
                              </a>
                            </h4>
                            <p className="muted">
                              {document.category ?? "Uncategorized"} ·{" "}
                              {document.fileType ?? "Unknown type"}
                            </p>
                          </div>
                          <div className="project-row-chip">
                            {formatDateTime(document.createdAt)}
                          </div>
                        </div>

                        <div className="project-row-meta">
                          <span>Uploaded by {document.uploadedByPersonName ?? "Unknown"}</span>
                          <span>{document.projectId ? "Project document" : "Library document"}</span>
                        </div>

                        {document.description ? (
                          <p className="project-row-notes">{document.description}</p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </div>

            <aside className="project-sidebar stack">
              <section className="card stack" id="time">
                <div className="section-heading">
                  <div>
                    <div className="section-kicker">Project time</div>
                    <h3>Logged work</h3>
                  </div>
                </div>

                <div className="project-time-metric-grid">
                  <div className="project-mini-stat">
                    <span>Total logged hours</span>
                    <strong>{formatHours(data.timeSummary.totalHours)}</strong>
                  </div>
                  <div className="project-mini-stat">
                    <span>Rough labor cost</span>
                    <strong>{formatCurrency(data.timeSummary.totalLaborCost)}</strong>
                  </div>
                  <div className="project-mini-stat">
                    <span>People with time</span>
                    <strong>{data.timeSummary.byPerson.length}</strong>
                  </div>
                </div>

                <div className="stack">
                  <div className="project-column-header">
                    <span>Hours by person</span>
                    <span>{data.timeSummary.byPerson.length}</span>
                  </div>

                  {data.timeSummary.byPerson.length === 0 ? (
                    <div className="empty-state">No tracked time yet.</div>
                  ) : (
                    data.timeSummary.byPerson.map((personSummary) => (
                      <article className="project-time-person" key={personSummary.personId}>
                        <div className="project-time-row">
                          <strong>{personSummary.personName}</strong>
                          <span>{formatHours(personSummary.hours)}</span>
                        </div>
                        <div className="muted">
                          {formatCurrency(personSummary.laborCost)}
                        </div>
                      </article>
                    ))
                  )}
                </div>

                <div className="stack">
                  <div className="project-column-header">
                    <span>Recent time entries</span>
                    <span>{data.timeSummary.recentEntries.length}</span>
                  </div>

                  {data.timeSummary.recentEntries.length === 0 ? (
                    <div className="empty-state">No recent entries.</div>
                  ) : (
                    data.timeSummary.recentEntries.map((entry) => (
                      <article className="project-time-entry" key={entry.id}>
                        <div className="project-time-row">
                          <strong>{entry.personName ?? "Unknown person"}</strong>
                          <span>{formatHours(entry.hours)}</span>
                        </div>
                        <div className="project-time-meta">
                          <span>{formatDate(entry.date)}</span>
                          <span>{formatSource(entry.source)}</span>
                        </div>
                        {entry.notes ? (
                          <p className="project-time-entry-notes">{entry.notes}</p>
                        ) : null}
                      </article>
                    ))
                  )}
                </div>
              </section>

              <section className="card stack">
                <div className="section-heading">
                  <div>
                    <div className="section-kicker">At a glance</div>
                    <h3>Quick facts</h3>
                  </div>
                </div>

                <dl className="data-pairs data-pairs-compact">
                  <div>
                    <dt>Client</dt>
                    <dd>{data.project.clientName ?? "No client name"}</dd>
                  </div>
                  <div>
                    <dt>Lead</dt>
                    <dd>{data.project.leadPersonName ?? "No lead assigned"}</dd>
                  </div>
                  <div>
                    <dt>Stage</dt>
                    <dd>{formatStage(data.project.stage)}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{data.project.active ? "Active" : "Inactive"}</dd>
                  </div>
                  <div>
                    <dt>Originating office</dt>
                    <dd>{data.project.originatingOfficeName}</dd>
                  </div>
                  <div>
                    <dt>Managing office</dt>
                    <dd>{data.project.managingOfficeName}</dd>
                  </div>
                </dl>
              </section>
            </aside>
          </div>
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
