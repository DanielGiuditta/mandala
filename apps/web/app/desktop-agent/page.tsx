import { getCurrentViewerAccess } from "@mandala/db"
import { canDownloadDesktopAgent } from "@mandala/domain"
import { redirect } from "next/navigation"

import { getViewerRequestContext } from "../../lib/auth/session"
import { getDesktopAgentRelease } from "../../lib/desktop-agent-release"
import { EntityHeader } from "../components/entity-header"

export const dynamic = "force-dynamic"

export default async function DesktopAgentPage() {
  const viewerContext = await getViewerRequestContext()
  const viewerAccess = await getCurrentViewerAccess(viewerContext)

  if (!viewerAccess.viewer || !canDownloadDesktopAgent(viewerAccess.viewer)) {
    redirect("/projects")
  }

  const release = await getDesktopAgentRelease()

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
              <p className="pd-empty">
                {release
                  ? `Current approved installer: ${release.filename}`
                  : "No verified Windows installer is currently available."}
              </p>
              {release ? (
                <a className="pd-primary-button" href="/api/desktop-agent/download">
                  Download {release.filename}
                </a>
              ) : null}
              <p className="pd-meta-text">
                Available to admins and partners. Installation always requires a Windows administrator to approve it.
              </p>
            </section>

            <section className="pd-card">
              <div className="pd-card-header">
                <h3 className="pd-card-title">Install on a workstation</h3>
              </div>
              <div className="pd-list">
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>1. Move old installers out of Downloads</h4>
                    <p className="pd-meta-text">
                      Remove or move every older MandalaAgentSetup file first. Keep only the exact approved filename shown above.
                    </p>
                  </div>
                </article>
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>2. Download and run setup</h4>
                    <p className="pd-meta-text">
                      Download the installer on the Windows computer, open the exact versioned filename, and have a Windows administrator approve installation.
                    </p>
                  </div>
                </article>
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>3. Verify the Agent before sign-in</h4>
                    <p className="pd-meta-text">
                      Before entering a password, confirm Agent v{release?.version ?? "the approved version"} and Backend {release?.backendProjectRef ?? "the production project"} are visible. Stop and contact IT if either value differs.
                    </p>
                  </div>
                </article>
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>4. Complete one save check</h4>
                    <p className="pd-meta-text">
                      Sign in, select the correct project, choose Start Work, then Stop. Record the save reference. If no reference appears, save diagnostics for IT before trying again.
                    </p>
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
                    <h4>Windows administrator is unavailable</h4>
                    <p className="pd-meta-text">Download the file now, but wait for IT to enter the administrator credentials before running setup.</p>
                  </div>
                </article>
                <article className="pd-list-item">
                  <div className="pd-list-item-main pd-list-item-main-column">
                    <h4>The employee cannot sign in</h4>
                    <p className="pd-meta-text">First re-check the version and backend shown before sign-in. Only then confirm they are using the same email and password as the Mandala web app.</p>
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
                    <p className="pd-meta-text">Select Save / copy diagnostics for IT before repeating the test. Send the diagnostics file, employee email, computer name, exact local time, project, and a screenshot of the displayed error.</p>
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
