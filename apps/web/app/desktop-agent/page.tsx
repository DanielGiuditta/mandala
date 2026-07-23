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
        <EntityHeader className="projects-domain-header" title="Windows companion" />
        <section className="pd-card">
          <div>
            <h2 className="pd-card-title">Download for Windows</h2>
            <p className="pd-meta-text">
              Download the companion installer for an employee workstation. It connects to Mandala so employees can select a project and track active work.
            </p>
          </div>
          <a className="pd-primary-button" href="/api/desktop-agent/download">
            Download Windows installer
          </a>
          <p className="pd-meta-text">
            This download is available to admins and partners. The installer includes the connection configuration required for employee sign-in.
          </p>
        </section>

        <section className="pd-card">
          <div>
            <h2 className="pd-card-title">Install on a workstation</h2>
            <ol className="desktop-agent-steps">
              <li>Download the installer on the Windows computer that will run the companion.</li>
              <li>Open <strong>MandalaAgentSetup.exe</strong> and approve the Windows prompt if one appears.</li>
              <li>Finish the installer, then open Mandala Windows Companion from the Start menu.</li>
              <li>Have the employee sign in with their Mandala account, choose their project, and select <strong>Start Work</strong>.</li>
            </ol>
          </div>
        </section>

        <section className="pd-card">
          <div>
            <h2 className="pd-card-title">Troubleshooting</h2>
            <ul className="desktop-agent-support-list">
              <li><strong>The download says no installer is published:</strong> IT needs to publish the current signed Windows release before workstations can install it.</li>
              <li><strong>Windows prevents installation:</strong> Confirm the installer came from this page. If the warning continues, send IT a screenshot of the warning before bypassing it.</li>
              <li><strong>The employee cannot sign in:</strong> Confirm they are using the same email and password as the Mandala web app.</li>
              <li><strong>No projects appear:</strong> Confirm the employee is active in Mandala and assigned to the relevant project.</li>
              <li><strong>The timer has paused:</strong> The companion pauses tracking after five minutes without keyboard or mouse activity. The employee must select <strong>Start Work</strong> to resume.</li>
              <li><strong>IT needs to investigate:</strong> Send the employee email, computer name, the time of the issue, and a screenshot of any displayed error.</li>
            </ul>
          </div>
        </section>
      </section>
    </main>
  )
}
