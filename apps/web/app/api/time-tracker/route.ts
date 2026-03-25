import {
  getSelfTimeTrackerData,
  recordSelfTimeTrackerEntry,
  type RecordSelfTimeTrackerEntryInput,
} from "@mandala/db"
import { NextRequest, NextResponse } from "next/server"

import { getViewerRequestContext } from "../../../lib/auth/session"

export async function GET(request: NextRequest) {
  try {
    const localDate = request.nextUrl.searchParams.get("localDate") ?? ""
    const viewerContext = await getViewerRequestContext()
    const result = await getSelfTimeTrackerData({ localDate }, viewerContext)

    return NextResponse.json(result)
  } catch (error) {
    console.error("GET /api/time-tracker failed", error)

    return NextResponse.json(
      {
        accessMessage:
          error instanceof Error
            ? error.message
            : "Unable to load time tracker.",
        configured: true,
        configMessage: null,
        forbidden: false,
        projects: [],
      },
      { status: 200 },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const viewerContext = await getViewerRequestContext()
    const input = (await request.json()) as RecordSelfTimeTrackerEntryInput
    const result = await recordSelfTimeTrackerEntry(input, viewerContext)

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
        error:
          error instanceof Error
            ? error.message
            : "Unable to save tracked time.",
        ok: false,
        todayHours: null,
      },
      { status: 200 },
    )
  }
}
