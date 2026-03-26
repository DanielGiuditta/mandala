import { getSelfTimeTrackerData } from "@mandala/db"

import { getViewerRequestContext } from "../../lib/auth/session"

export const dynamic = "force-dynamic"

function formatTrackerError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }

  if (!error || typeof error !== "object") {
    return "Unable to load time tracker."
  }

  const candidate = error as {
    code?: unknown
    details?: unknown
    hint?: unknown
    message?: unknown
    name?: unknown
  }

  const parts = [
    typeof candidate.message === "string" ? candidate.message : null,
    typeof candidate.code === "string" ? `code=${candidate.code}` : null,
    typeof candidate.details === "string" && candidate.details
      ? `details=${candidate.details}`
      : null,
    typeof candidate.hint === "string" && candidate.hint
      ? `hint=${candidate.hint}`
      : null,
    typeof candidate.name === "string" && candidate.name
      ? `name=${candidate.name}`
      : null,
  ].filter((part): part is string => Boolean(part))

  return parts.length > 0 ? parts.join(" | ") : JSON.stringify(error)
}

function getLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function formatTodayHours(hours: number): string {
  const totalMinutes = Math.max(0, Math.round(hours * 60))
  const wholeHours = Math.floor(totalMinutes / 60)
  const remainingMinutes = totalMinutes % 60

  if (wholeHours === 0) {
    return `${remainingMinutes}m`
  }

  if (remainingMinutes === 0) {
    return `${wholeHours}h`
  }

  return `${wholeHours}h ${remainingMinutes}m`
}

export default async function TimeTrackerPage() {
  const viewerContext = await getViewerRequestContext()
  const data = await getSelfTimeTrackerData(
    { localDate: getLocalDateString(new Date()) },
    viewerContext,
  ).catch((error) => {
    console.error("GET /time-tracker page failed", error)

    return {
      accessMessage: formatTrackerError(error),
      configured: true,
      configMessage: null,
      forbidden: false,
      projects: [],
    }
  })

  return (
    <main className="ui-page">
      <div className="ui-page-shell ui-stack">
        <section className="ui-surface ui-card">
          <div className="ui-copy">
            <h1 className="ui-card-title">Time tracker</h1>
            <p className="ui-meta">
              Start and stop time from the sidebar tracker. This page keeps the tool visible in
              navigation and shows the active project list for today.
            </p>
          </div>

          {data.accessMessage ? <div className="ui-notice">{data.accessMessage}</div> : null}

          {!data.accessMessage ? (
            <p className="ui-meta">
              Pick any active project in the sidebar and use <code>Start</code> and{" "}
              <code>Stop</code> to create a manual time entry.
            </p>
          ) : null}
        </section>

        <section className="ui-surface ui-card">
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Today</th>
                </tr>
              </thead>
              <tbody>
                {data.projects.length === 0 ? (
                  <tr>
                    <td className="ui-meta" colSpan={2}>
                      No active projects are available in the tracker right now.
                    </td>
                  </tr>
                ) : null}

                {data.projects.map((project) => (
                  <tr key={project.id}>
                    <td>{project.name}</td>
                    <td>{formatTodayHours(project.todayHours)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
