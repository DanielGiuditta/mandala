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
              <p className="pd-meta-text">
                <a className="pd-text-button" href="/mandala-test-checklist.txt" download="mandala-test-checklist.txt">
                  Download the simple test checklist
                </a>
              </p>
            </section>

            <section className="pd-card">
              <div className="pd-card-header">
                <h3 className="pd-card-title">Four quick tests</h3>
              </div>
              <p className="pd-meta-text">
                Start with one employee on a PC with internet. Then ask local IT to prepare the LAN-only PC and follow the downloaded checklist.
              </p>
              <div className="pd-list">
                {[
                  ["1. Start and stop", "Work for one minute, stop, and confirm the saved entry appears for the right employee and project."],
                  ["2. Switch projects", "Work for one minute on each of two projects. Confirm both entries are saved."],
                  ["3. Disconnect and reconnect", "On the LAN PC, start while connected, disconnect and stop. Reopen Mandala, reconnect, and confirm the time saves once."],
                  ["4. Leave it idle", "Leave the keyboard and mouse untouched for six minutes. Confirm the timer pauses and saves."],
                ].map(([title, description]) => (
                  <article className="pd-list-item" key={title}>
                    <div className="pd-list-item-main pd-list-item-main-column">
                      <h4>{title}</h4>
                      <p className="pd-meta-text">{description}</p>
                    </div>
                  </article>
                ))}
              </div>
              <p className="pd-meta-text">
                If sign-in times out or the LAN address is missing, save diagnostics and ask local IT to check the gateway first. Send one result with the employee email, projects, IST times, save references and any diagnostics. A local Mandala administrator should confirm the actual saved entries.
              </p>
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
                    <p className="pd-meta-text">IT needs to publish the current audited Windows release before workstations can install it.</p>
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
                    <p className="pd-meta-text">For a timeout on a LAN-only PC, ask local IT to check the gateway connection first. For an invalid-login message, confirm the employee is using their Mandala email and password.</p>
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
