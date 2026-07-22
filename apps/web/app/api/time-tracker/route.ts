import {
  createPerfTrace,
  getSelfTimeTrackerData,
  invalidatePeopleReadCaches,
  invalidateProjectReadCaches,
  startSelfTimeTrackerSession,
  stopSelfTimeTrackerSession,
  touchSelfTimeTrackerSession,
  type StartSelfTimeTrackerSessionInput,
  type StopSelfTimeTrackerSessionInput,
} from "@mandala/db"
import { revalidatePath, revalidateTag } from "next/cache"
import { NextRequest, NextResponse } from "next/server"

import { getViewerRequestContext } from "../../../lib/auth/session"
import { getPeopleTag } from "../../people/data-cache"
import { getProjectTag, getProjectsTag } from "../../projects/data-cache"

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

export async function GET(request: NextRequest) {
  const trace = createPerfTrace("api.timeTracker.GET")

  try {
    const localDate = request.nextUrl.searchParams.get("localDate") ?? ""
    const viewerContext = await trace.measure("getViewerRequestContext", () =>
      getViewerRequestContext(),
    )
    const result = await trace.measure("getSelfTimeTrackerData", () =>
      getSelfTimeTrackerData({ localDate }, viewerContext),
    )
    trace.finish({
      forbidden: result.forbidden,
      projectCount: result.projects.length,
      result: "ok",
    })

    const headers = new Headers()
    const serverTiming = trace.toServerTimingHeader()

    if (serverTiming) {
      headers.set("Server-Timing", serverTiming)
    }

    return NextResponse.json(result, { headers })
  } catch (error) {
    console.error("GET /api/time-tracker failed", error)
    trace.finish({ result: "error" })

    const headers = new Headers()
    const serverTiming = trace.toServerTimingHeader()

    if (serverTiming) {
      headers.set("Server-Timing", serverTiming)
    }

    return NextResponse.json(
      {
        activeSession: null,
        accessMessage: formatTrackerError(error),
        configured: true,
        configMessage: null,
        forbidden: false,
        projects: [],
      },
      { headers, status: 200 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewerContext = await getViewerRequestContext()
    const input = (await request.json()) as
      | ({ action: "start" } & StartSelfTimeTrackerSessionInput)
      | ({ action: "stop" } & StopSelfTimeTrackerSessionInput)
      | { action: "activity" }
    const result = input.action === "start"
      ? await startSelfTimeTrackerSession(input, viewerContext)
      : input.action === "stop"
        ? await stopSelfTimeTrackerSession(input, viewerContext)
        : input.action === "activity"
          ? (await touchSelfTimeTrackerSession(viewerContext), {
              activeSession: null,
              stoppedProjectId: null,
            })
          : null

    if (!result) {
      throw new Error("Time tracker action is invalid.")
    }

    if (input.action === "activity") {
      return NextResponse.json({
        activeSession: null,
        error: null,
        ok: true,
        stoppedProjectId: null,
      })
    }

    invalidateProjectReadCaches()
    invalidatePeopleReadCaches()
    revalidateTag(getProjectsTag())
    if (result.stoppedProjectId) {
      revalidateTag(getProjectTag(result.stoppedProjectId))
      revalidatePath(`/projects/${result.stoppedProjectId}`)
    }
    if (result.activeSession) {
      revalidateTag(getProjectTag(result.activeSession.projectId))
      revalidatePath(`/projects/${result.activeSession.projectId}`)
    }
    revalidateTag(getPeopleTag())
    revalidatePath("/projects")
    revalidatePath("/people")
    revalidatePath("/time-tracker")

    return NextResponse.json({
      activeSession: result.activeSession,
      error: null,
      ok: true,
      stoppedProjectId: result.stoppedProjectId,
    })
  } catch (error) {
    console.error("POST /api/time-tracker failed", error)

    return NextResponse.json(
      {
        activeSession: null,
        error: formatTrackerError(error),
        ok: false,
        stoppedProjectId: null,
      },
      { status: 200 },
    )
  }
}
