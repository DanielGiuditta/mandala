import {
  createServiceRoleSupabaseClient,
  getCurrentViewerAccess,
  getDatabaseStatus,
} from "@mandala/db"
import { canDownloadDesktopAgent } from "@mandala/domain"
import { NextResponse } from "next/server"

import { getViewerRequestContext } from "../../../../lib/auth/session"
import {
  GATEWAY_RELEASE_BUCKET,
  getGatewayRelease,
} from "../../../../lib/gateway-release"

export async function GET() {
  const viewerContext = await getViewerRequestContext()
  const viewerAccess = await getCurrentViewerAccess(viewerContext)

  if (!viewerAccess.viewer || !canDownloadDesktopAgent(viewerAccess.viewer)) {
    return NextResponse.json({ error: "Gateway download is unavailable." }, { status: 403 })
  }

  if (!getDatabaseStatus().configured) {
    return NextResponse.json({ error: "Gateway downloads require a configured database." }, { status: 503 })
  }

  const client = createServiceRoleSupabaseClient()

  if (!client) {
    return NextResponse.json({ error: "Gateway download service is unavailable." }, { status: 503 })
  }

  const release = await getGatewayRelease()
  if (!release) {
    return NextResponse.json(
      { error: "No verified Windows gateway installer has been published yet." },
      { status: 404 },
    )
  }

  const { data, error } = await client.storage
    .from(GATEWAY_RELEASE_BUCKET)
    .createSignedUrl(release.objectPath, 60)

  if (error || !data?.signedUrl) {
    return NextResponse.json(
      { error: "No Windows gateway installer has been published yet." },
      { status: 404 },
    )
  }

  return NextResponse.redirect(data.signedUrl)
}
