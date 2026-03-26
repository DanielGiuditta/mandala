import {
  createPerfTrace,
  getSelfTimeTrackerData,
  invalidatePeopleReadCaches,
  invalidateProjectReadCaches,
  recordSelfTimeTrackerEntry,
  type RecordSelfTimeTrackerEntryInput,
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
    const input = (await request.json()) as RecordSelfTimeTrackerEntryInput
    const result = await recordSelfTimeTrackerEntry(input, viewerContext)

    invalidateProjectReadCaches()
    invalidatePeopleReadCaches()
    revalidateTag(getProjectsTag())
    revalidateTag(getProjectTag(result.entry.projectId))
    revalidateTag(getPeopleTag())
    revalidatePath("/projects")
    revalidatePath(`/projects/${result.entry.projectId}`)
    revalidatePath("/people")
    revalidatePath(`/people/${result.entry.personId}`)
    revalidatePath("/time-tracker")

    return NextResponse.json({
      entry: result.entry,
      error: null,
      ok: true,
      todayHours: result.todayHours,
    })
  } catch (error) {
    console.error("POST /api/time-tracker failed", error)

    return NextResponse.json(
      {
        entry: null,
        error: formatTrackerError(error),
        ok: false,
        todayHours: null,
      },
      { status: 200 },
    )
  }
}
