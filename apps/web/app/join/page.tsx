import Link from "next/link"

import { getAppSessionState } from "../../lib/auth/session"
import { AuthHashHandoff } from "../components/auth-hash-handoff"

import { claimJoinEmailAction, setPasswordAction } from "./actions"

interface JoinPageProps {
  searchParams: Promise<{
    error?: string
    token_hash?: string
    type?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function JoinPage({ searchParams }: JoinPageProps) {
  const params = await searchParams
  const session = await getAppSessionState()
  const hasJoinToken = Boolean(
    params.token_hash && (params.type === "invite" || params.type === "recovery"),
  )

  if (!session.configured) {
    return (
      <main className="ui-page ui-auth-shell">
        <section className="ui-surface ui-card ui-auth-card">
          <AuthHashHandoff />

          <div className="ui-copy">
            <h1 className="ui-card-title">Join unavailable</h1>
            <p className="ui-meta">Supabase auth is not configured for this workspace yet.</p>
          </div>

          <div className="ui-notice">
            Configure <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable invite-based onboarding.
          </div>

          <div className="ui-actions">
            <Link className="ui-button ui-button-secondary" href="/login">
              Back to login
            </Link>
          </div>
        </section>
      </main>
    )
  }

  if (session.isAuthenticated) {
    return (
      <main className="ui-page ui-auth-shell">
        <section className="ui-surface ui-card ui-auth-card">
          <AuthHashHandoff />

          <div className="ui-copy">
            <h1 className="ui-card-title">Set password</h1>
            <p className="ui-meta">
              Finish setting your password with the emailed link below, then continue into the
              workspace.
            </p>
          </div>

          <div className="ui-notice">
            Signed in as <strong>{session.sessionEmail}</strong>.
          </div>

          {params.error ? <div className="ui-notice">{params.error}</div> : null}

          <form action={setPasswordAction} className="ui-stack">
            <label className="ui-field">
              <span className="ui-label">New password</span>
              <input
                autoComplete="new-password"
                autoFocus
                className="ui-input"
                minLength={6}
                name="password"
                required
                type="password"
              />
            </label>

            <label className="ui-field">
              <span className="ui-label">Confirm password</span>
              <input
                autoComplete="new-password"
                className="ui-input"
                minLength={6}
                name="confirmPassword"
                required
                type="password"
              />
            </label>

            <div className="ui-actions">
              <button className="ui-button ui-button-primary" type="submit">
                Save password
              </button>
            </div>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="ui-page ui-auth-shell">
      <section className="ui-surface ui-card ui-auth-card">
        <AuthHashHandoff />

        <div className="ui-copy">
          <h1 className="ui-card-title">Join Mandala</h1>
          <p className="ui-meta">
            Open the account email you were sent, then continue here to verify it and set a
            password.
          </p>
        </div>

        {params.error ? <div className="ui-notice">{params.error}</div> : null}

        {hasJoinToken ? (
          <form action={claimJoinEmailAction} className="ui-stack">
            <input name="tokenHash" type="hidden" value={params.token_hash ?? ""} />
            <input name="type" type="hidden" value={params.type ?? ""} />

            <div className="ui-notice">
              Continue to verify your email and start setting your password.
            </div>

            <div className="ui-actions">
              <button className="ui-button ui-button-primary" type="submit">
                Continue
              </button>
              <Link className="ui-button ui-button-secondary" href="/login">
                Back to login
              </Link>
            </div>
          </form>
        ) : (
          <>
            <div className="ui-notice">
              Use the email link you were sent to begin. If it expired, ask a partner or admin to
              resend it.
            </div>

            <div className="ui-actions">
              <Link className="ui-button ui-button-secondary" href="/login">
                Back to login
              </Link>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
