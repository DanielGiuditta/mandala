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
      <section className="pd-entity">
        <EntityHeader className="pd-entity-header" title="Windows companion" />
        <div className="pd-entity-content">
        <section className="pd-card">
          <div className="pd-card-header">
            <h3 className="pd-card-title">Why the companion is needed</h3>
          </div>
          <p className="pd-empty">
            The Windows companion is the workstation app for reliable time tracking. It records time against the project an employee is actively working on, even while they are using their desktop tools.
          </p>
          <div className="pd-list">
            <article className="pd-list-item">
              <div className="pd-list-item-main pd-list-item-main-column">
                <h4>One active project at a time</h4>
                <p className="pd-meta-text">Starting work on a new project stops and saves the previous project timer before the new one begins.</p>
              </div>
            </article>
            <article className="pd-list-item">
              <div className="pd-list-item-main pd-list-item-main-column">
                <h4>Accurate time allocation</h4>
                <p className="pd-meta-text">Employees choose Start Work for the project they are working on, so time is recorded against the correct project.</p>
              </div>
            </article>
            <article className="pd-list-item">
              <div className="pd-list-item-main pd-list-item-main-column">
                <h4>Idle time protection</h4>
                <p className="pd-meta-text">Tracking pauses after five minutes without keyboard or mouse activity and only resumes when the employee selects Start Work.</p>
              </div>
            </article>
          </div>
        </section>

        <div className="pd-columns">
          <div className="pd-col-main">
            <section className="pd-card">
              <div className="pd-card-header">
                <h3 className="pd-card-title">Download</h3>
              </div>
              <p className="pd-empty">Download the companion installer for an employee workstation.</p>
              <a className="pd-primary-button" href="/api/desktop-agent/download">
                Download Windows installer
              </a>
              <p className="pd-meta-text">
                Available to admins and partners. The installer includes the connection configuration required for employee sign-in.
              </p>
            </section>

            <section className="pd-card">
              <div className="pd-card-header">
                <h3 className="pd-card-title">Install on a workstation</h3>
              </div>
              <div className="pd-list">
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>1. Download the installer</h4>
                    <p className="pd-meta-text">Download it on the Windows computer that will run the companion.</p>
                  </div>
                </article>
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>2. Run setup</h4>
                    <p className="pd-meta-text">Open MandalaAgentSetup.exe and approve the Windows prompt if one appears.</p>
                  </div>
                </article>
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>3. Open the companion</h4>
                    <p className="pd-meta-text">Finish setup, then open Mandala Windows Companion from the Start menu.</p>
                  </div>
                </article>
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>4. Start tracking</h4>
                    <p className="pd-meta-text">Have the employee sign in, choose their project, and select Start Work.</p>
                  </div>
                </article>
              </div>
            </section>
          </div>

          <div className="pd-col-side">
            <section className="pd-card">
              <div className="pd-card-header">
                <h3 className="pd-card-title">Troubleshooting</h3>
              </div>
              <div className="pd-list">
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>No installer is published</h4>
                    <p className="pd-meta-text">IT needs to publish the current signed Windows release before workstations can install it.</p>
                  </div>
                </article>
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>Windows prevents installation</h4>
                    <p className="pd-meta-text">Confirm the installer came from this page. If the warning continues, send IT a screenshot before bypassing it.</p>
                  </div>
                </article>
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>The employee cannot sign in</h4>
                    <p className="pd-meta-text">Confirm they are using the same email and password as the Mandala web app.</p>
                  </div>
                </article>
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>No projects appear</h4>
                    <p className="pd-meta-text">Confirm the employee is active in Mandala and assigned to the relevant project.</p>
                  </div>
                </article>
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>The timer has paused</h4>
                    <p className="pd-meta-text">The companion pauses after five minutes without activity. The employee must select Start Work to resume.</p>
                  </div>
                </article>
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>IT needs to investigate</h4>
                    <p className="pd-meta-text">Send the employee email, computer name, the time of the issue, and a screenshot of any displayed error.</p>
                  </div>
                </article>
              </div>
            </section>
          </div>
        </div>
        </div>
      </section>
    </main>
  )
}
