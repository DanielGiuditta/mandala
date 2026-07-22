import { getDatabaseStatus, getCurrentViewerAccess, getSelfTimeTrackerData } from "@mandala/db"
import { canViewTimeTrackerWorkspace } from "@mandala/domain"
import { redirect } from "next/navigation"

import { getViewerRequestContext } from "../../lib/auth/session"
import { TimeTrackerDomainList } from "../components/time-tracker-domain-list"

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

export default async function TimeTrackerPage() {
  const viewerContext = await getViewerRequestContext()
  const viewerAccess = await getCurrentViewerAccess(viewerContext)
  const status = getDatabaseStatus()

  if (viewerAccess.viewer && !canViewTimeTrackerWorkspace(viewerAccess.viewer)) {
    redirect("/projects")
  }

  if (!viewerAccess.viewer) {
    return (
      <main className="stack">
        <TimeTrackerDomainList
          data={{
            activeSession: null,
            accessMessage:
              viewerAccess.accessMessage ??
              "Current viewer cannot access the time tracker.",
            configured: status.configured,
            configMessage: status.message,
            forbidden: true,
            projects: [],
          }}
        />
      </main>
    )
  }

  const data = await getSelfTimeTrackerData(
    { localDate: getLocalDateString(new Date()) },
    viewerContext,
  ).catch((error) => {
    console.error("GET /time-tracker page failed", error)

    return {
      activeSession: null,
      accessMessage: formatTrackerError(error),
      configured: true,
      configMessage: null,
      forbidden: false,
      projects: [],
    }
  })

  return (
    <main className="stack">
      <TimeTrackerDomainList data={data} />
    </main>
  )
}
