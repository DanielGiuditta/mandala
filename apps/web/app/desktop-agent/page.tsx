import { getCurrentViewerAccess } from "@mandala/db"
import { canDownloadDesktopAgent } from "@mandala/domain"
import { redirect } from "next/navigation"

import { getViewerRequestContext } from "../../lib/auth/session"
import { EntityHeader } from "../components/entity-header"

export const dynamic = "force-dynamic"

export default async function DesktopAgentPage() {
  const viewerContext = await getViewerRequestContext()
  const viewerAccess = await getCurrentViewerAccess(viewerContext)

  if (!viewerAccess.viewer || !canDownloadDesktopAgent(viewerAccess.viewer)) {
    redirect("/projects")
  }

  return (
    <main className="pd-page">
      <section className="projects-domain">
        <EntityHeader className="projects-domain-header" title="Windows agent" />
        <section className="pd-card">
          <div>
            <h2 className="pd-card-title">Mandala Windows Agent</h2>
            <p className="pd-meta-text">
              Install this companion on each employee workstation to select projects, track active work, and pause idle time.
            </p>
          </div>
          <a className="pd-primary-button" href="/api/desktop-agent/download">
            Download Windows installer
          </a>
          <p className="pd-meta-text">
            The installer is available to admins and partners only. It includes the connection configuration required for employee sign-in.
          </p>
        </section>
      </section>
    </main>
  )
}
