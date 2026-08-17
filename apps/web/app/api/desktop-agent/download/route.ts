import {
  createServiceRoleSupabaseClient,
  getCurrentViewerAccess,
  getDatabaseStatus,
} from "@mandala/db"
import { canDownloadDesktopAgent } from "@mandala/domain"
import { NextResponse } from "next/server"

import { getViewerRequestContext } from "../../../../lib/auth/session"
import {
  DESKTOP_AGENT_BUCKET,
  getDesktopAgentRelease,
} from "../../../../lib/desktop-agent-release"

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

  const release = await getDesktopAgentRelease()
  if (!release) {
    return NextResponse.json(
      { error: "No verified Windows agent installer has been published yet." },
      { status: 404 },
    )
  }

  const { data, error } = await client.storage
    .from(DESKTOP_AGENT_BUCKET)
    .createSignedUrl(release.objectPath, 60)

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: "No Windows agent installer has been published yet." },
      { status: 404 },
    )
  }

  return NextResponse.redirect(data.signedUrl)
}
