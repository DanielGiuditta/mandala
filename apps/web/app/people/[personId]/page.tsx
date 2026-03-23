import Link from "next/link"
import { notFound } from "next/navigation"

import { getPersonDetail } from "@mandala/db"

import { getViewerRequestContext } from "../../../lib/auth/session"

interface PersonDetailPageProps {
  params: Promise<{
    personId: string
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

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatStage(value: string): string {
  if (value === "onHold") {
    return "On hold"
  }

  return value.charAt(0).toUpperCase() + value.slice(1)
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

export default async function PersonDetailPage({ params }: PersonDetailPageProps) {
  const { personId } = await params
  const viewerContext = await getViewerRequestContext()
  const data = await getPersonDetail(personId, viewerContext)

  if (data.configured && !data.person && !data.forbidden) {
    notFound()
  }

  const openChecklistItems = data.checklistItems.filter((item) => !item.completed)
  const completedChecklistItems = data.checklistItems.filter((item) => item.completed)

  return (
    <main className="person-detail-page stack">
      <div className="button-row">
        <Link className="secondary" href="/people">
          Back to people
        </Link>
      </div>

      {!data.configured && data.configMessage ? (
        <div className="notice">{data.configMessage}</div>
      ) : null}
      {data.accessMessage ? <div className="notice">{data.accessMessage}</div> : null}

      {data.forbidden ? (
        <section className="card">
          <h2>Person access</h2>
          <p className="muted">
            This viewer does not have access to the requested person record.
          </p>
          {data.viewerLabel ? <p className="muted">Viewer: {data.viewerLabel}</p> : null}
        </section>
      ) : null}

      {data.person && !data.forbidden ? (
        <>
          <section className="card person-hero stack">
            <div className="person-hero-top">
              <div className="stack">
                <div className="project-kicker">Person detail</div>
                <div className="person-title-row">
                  <div className="stack person-title-block">
                    <h2 className="person-title">{data.person.fullName}</h2>
                    <p className="person-subtitle">
                      {data.person.title ?? "No title"} · {data.person.officeName}
                    </p>
                  </div>

                  <div className="project-badge-row">
                    <span className="pill person-office-pill">{data.person.officeName}</span>
                    <span className="pill project-status-pill">
                      {data.person.active ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>

                <p className="project-description-copy">
                  {data.person.email
                    ? `${data.person.fullName} is based in ${data.person.officeName} and can be reached at ${data.person.email}.`
                    : `${data.person.fullName} is based in ${data.person.officeName}.`}
                </p>
                {data.viewerLabel ? <p className="muted">Viewer: {data.viewerLabel}</p> : null}
              </div>

              <div className="project-facts-grid">
                <div className="project-fact">
                  <span className="project-fact-label">Home office</span>
                  <strong className="project-fact-value">{data.person.officeName}</strong>
                </div>
                <div className="project-fact">
                  <span className="project-fact-label">Availability / week</span>
                  <strong className="project-fact-value">
                    {formatHours(data.person.availabilityHoursPerWeek)}
                  </strong>
                </div>
                <div className="project-fact">
                  <span className="project-fact-label">Hourly cost</span>
                  <strong className="project-fact-value">
                    {formatCurrency(data.person.hourlyCost)}
                  </strong>
                </div>
                <div className="project-fact">
                  <span className="project-fact-label">Annual salary</span>
                  <strong className="project-fact-value">
                    {formatCurrency(data.person.annualSalary)}
                  </strong>
                </div>
              </div>
            </div>

            <nav aria-label="Person sections" className="project-section-nav">
              <a href="#profile">Profile</a>
              <a href="#assignments">Assignments</a>
              <a href="#checklist">Checklist</a>
              <a href="#time">Project time</a>
            </nav>

            <div className="project-stat-grid">
              <div className="project-stat-card">
                <span className="project-stat-label">Assigned / week</span>
                <strong className="project-stat-value">
                  {formatHours(data.person.assignedHours)}
                </strong>
              </div>
              <div className="project-stat-card">
                <span className="project-stat-label">Remaining capacity</span>
                <strong className="project-stat-value">
                  {formatHours(data.person.remainingCapacity)}
                </strong>
              </div>
              <div className="project-stat-card">
                <span className="project-stat-label">Allocation</span>
                <strong className="project-stat-value">
                  {formatPercent(data.person.allocationPercent)}
                </strong>
              </div>
              <div className="project-stat-card">
                <span className="project-stat-label">Utilization, latest tracked week</span>
                <strong className="project-stat-value">
                  {formatPercent(data.timeSummary.latestTrackedWeekUtilizationPercent)}
                </strong>
              </div>
              <div className="project-stat-card">
                <span className="project-stat-label">Total labor cost</span>
                <strong className="project-stat-value">
                  {formatCurrency(data.timeSummary.totalLaborCost)}
                </strong>
              </div>
            </div>
          </section>

          <div className="project-layout">
            <div className="project-main stack">
              <section className="card stack" id="profile">
                <div className="section-heading">
                  <div>
                    <div className="section-kicker">Profile</div>
                    <h3>Person summary</h3>
                  </div>
                  <p className="muted">
                    Salary, availability, and office context for this person.
                  </p>
                </div>

                <div className="project-overview-grid">
                  <article className="project-panel project-panel-strong">
                    <div className="section-label">Contact</div>
                    <p className="project-panel-copy">
                      {data.person.email ?? "No email recorded for this person yet."}
                    </p>
                  </article>

                  <article className="project-panel">
                    <div className="section-label">Capacity</div>
                    <dl className="data-pairs">
                      <div>
                        <dt>Availability / week</dt>
                        <dd>{formatHours(data.person.availabilityHoursPerWeek)}</dd>
                      </div>
                      <div>
                        <dt>Assigned / week</dt>
                        <dd>{formatHours(data.person.assignedHours)}</dd>
                      </div>
                      <div>
                        <dt>Remaining capacity</dt>
                        <dd>{formatHours(data.person.remainingCapacity)}</dd>
                      </div>
                      <div>
                        <dt>Allocation</dt>
                        <dd>{formatPercent(data.person.allocationPercent)}</dd>
                      </div>
                    </dl>
                  </article>

                  <article className="project-panel">
                    <div className="section-label">Compensation</div>
                    <dl className="data-pairs">
                      <div>
                        <dt>Annual salary</dt>
                        <dd>{formatCurrency(data.person.annualSalary)}</dd>
                      </div>
                      <div>
                        <dt>Hourly cost</dt>
                        <dd>{formatCurrency(data.person.hourlyCost)}</dd>
                      </div>
                      <div>
                        <dt>Status</dt>
                        <dd>{data.person.active ? "Active" : "Inactive"}</dd>
                      </div>
                      <div>
                        <dt>Home office</dt>
                        <dd>{data.person.officeName}</dd>
                      </div>
                    </dl>
                  </article>
                </div>
              </section>

              <section className="card stack" id="assignments">
                <div className="section-heading">
                  <div>
                    <div className="section-kicker">Assignments</div>
                    <h3>Project staffing</h3>
                  </div>
                  <p className="muted">
                    {data.assignments.length} assignments totaling{" "}
                    {formatHours(data.person.assignedHours)} per week.
                  </p>
                </div>

                {data.assignments.length === 0 ? (
                  <div className="empty-state">No project assignments yet.</div>
                ) : (
                  <div className="stack">
                    {data.assignments.map((assignment) => (
                      <article className="project-row-card" key={assignment.id}>
                        <div className="project-row-top">
                          <div>
                            <h4>
                              <Link href={`/projects/${assignment.projectId}`}>
                                {assignment.projectName}
                              </Link>
                            </h4>
                            <p className="muted">
                              {formatStage(assignment.projectStage)} ·{" "}
                              {assignment.managingOfficeName ?? "Unknown office"}
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
                    <h3>Assigned to-dos</h3>
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
                            <h4>
                              <Link href={`/projects/${item.projectId}`}>{item.title}</Link>
                            </h4>
                            <span className="pill project-open-pill">Open</span>
                          </div>
                          <div className="project-checklist-meta">
                            <span>Project: {item.projectName}</span>
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
                            <h4>
                              <Link href={`/projects/${item.projectId}`}>{item.title}</Link>
                            </h4>
                            <span className="pill project-complete-pill">Completed</span>
                          </div>
                          <div className="project-checklist-meta">
                            <span>Project: {item.projectName}</span>
                            <span>Completed {formatDateTime(item.completedAt)}</span>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>
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
                    <span>Latest tracked week</span>
                    <strong>{formatHours(data.timeSummary.latestTrackedWeekHours)}</strong>
                  </div>
                  <div className="project-mini-stat">
                    <span>Total labor cost</span>
                    <strong>{formatCurrency(data.timeSummary.totalLaborCost)}</strong>
                  </div>
                </div>

                <div className="stack">
                  <div className="project-column-header">
                    <span>Hours by project</span>
                    <span>{data.timeSummary.byProject.length}</span>
                  </div>

                  {data.timeSummary.byProject.length === 0 ? (
                    <div className="empty-state">No tracked time yet.</div>
                  ) : (
                    data.timeSummary.byProject.map((project) => (
                      <article className="project-time-person" key={project.projectId}>
                        <div className="project-time-row">
                          <strong>
                            <Link href={`/projects/${project.projectId}`}>
                              {project.projectName}
                            </Link>
                          </strong>
                          <span>{formatHours(project.hours)}</span>
                        </div>
                        <div className="muted">{formatCurrency(project.laborCost)}</div>
                      </article>
                    ))
                  )}
                </div>

                <div className="stack">
                  <div className="project-column-header">
                    <span>Recent entries</span>
                    <span>{data.timeSummary.recentEntries.length}</span>
                  </div>

                  {data.timeSummary.recentEntries.length === 0 ? (
                    <div className="empty-state">No recent entries.</div>
                  ) : (
                    data.timeSummary.recentEntries.map((entry) => (
                      <article className="project-time-entry" key={entry.id}>
                        <div className="project-time-row">
                          <strong>
                            <Link href={`/projects/${entry.projectId}`}>{entry.projectName}</Link>
                          </strong>
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
                    <dt>Title</dt>
                    <dd>{data.person.title ?? "No title"}</dd>
                  </div>
                  <div>
                    <dt>Home office</dt>
                    <dd>{data.person.officeName}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{data.person.email ?? "No email"}</dd>
                  </div>
                  <div>
                    <dt>Allocation</dt>
                    <dd>{formatPercent(data.person.allocationPercent)}</dd>
                  </div>
                  <div>
                    <dt>Utilization, latest tracked week</dt>
                    <dd>
                      {formatPercent(data.timeSummary.latestTrackedWeekUtilizationPercent)}
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{data.person.active ? "Active" : "Inactive"}</dd>
                  </div>
                </dl>
              </section>
            </aside>
          </div>
        </>
      ) : (
        <section className="card">
          <h2>Person detail</h2>
          <p className="muted">
            Configure the database connection to load live person detail data.
          </p>
        </section>
      )}
    </main>
  )
}
