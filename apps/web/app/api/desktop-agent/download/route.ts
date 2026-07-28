import {
  createServiceRoleSupabaseClient,
  getCurrentViewerAccess,
  getDatabaseStatus,
} from "@mandala/db"
import { canDownloadDesktopAgent } from "@mandala/domain"
import { NextResponse } from "next/server"

import { getViewerRequestContext } from "../../../../lib/auth/session"

const DESKTOP_AGENT_BUCKET = "desktop-agent-releases"

async function resolveReleasePath(
  client: NonNullable<ReturnType<typeof createServiceRoleSupabaseClient>>,
) {
  const configuredPath = process.env.DESKTOP_AGENT_RELEASE_PATH?.trim()
  if (configuredPath) {
    return configuredPath
  }

  const { data: releases, error } = await client.storage
    .from(DESKTOP_AGENT_BUCKET)
    .list("latest", {
      limit: 100,
      sortBy: { column: "created_at", order: "desc" },
    })

  const newestVersionedRelease = releases?.find((release) =>
    /^MandalaAgentSetup-\d+\.\d+\.\d+\.exe$/i.test(release.name),
  )

  if (!error && newestVersionedRelease) {
    return `latest/${newestVersionedRelease.name}`
  }

  return "latest/MandalaAgentSetup.exe"
}

export async function GET() {
  const viewerContext = await getViewerRequestContext()
  const viewerAccess = await getCurrentViewerAccess(viewerContext)

  if (!viewerAccess.viewer || !canDownloadDesktopAgent(viewerAccess.viewer)) {
    return NextResponse.json({ error: "Desktop agent download is unavailable." }, { status: 403 })
  }

  if (!getDatabaseStatus().configured) {
    return NextResponse.json({ error: "Desktop agent downloads require a configured database." }, { status: 503 })
  }

  const client = createServiceRoleSupabaseClient()

  if (!client) {
    return NextResponse.json({ error: "Desktop agent download service is unavailable." }, { status: 503 })
  }

  const releasePath = await resolveReleasePath(client)
  const { data, error } = await client.storage
    .from(DESKTOP_AGENT_BUCKET)
    .createSignedUrl(releasePath, 60)

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: "No Windows agent installer has been published yet." },
      { status: 404 },
    )
  }

  return NextResponse.redirect(data.signedUrl)
}
