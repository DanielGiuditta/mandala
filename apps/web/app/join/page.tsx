import Link from "next/link"

import { getAppSessionState } from "../../lib/auth/session"

import { claimInviteAction, setPasswordAction } from "./actions"

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
  const hasInviteToken = Boolean(params.token_hash && params.type === "invite")

  if (!session.configured) {
    return (
      <main className="auth-page stack">
        <section className="card auth-card stack">
          <div className="page-title">
            <div>
              <h2>Join unavailable</h2>
              <p className="muted">
                Supabase auth is not configured for this workspace yet.
              </p>
            </div>
          </div>

          <div className="notice">
            Configure <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable invite-based onboarding.
          </div>

          <div className="button-row">
            <Link href="/login">Back to login</Link>
          </div>
        </section>
      </main>
    )
  }

  if (session.isAuthenticated) {
    return (
      <main className="auth-page stack">
        <section className="card auth-card stack">
          <div className="page-title">
            <div>
              <h2>Set password</h2>
              <p className="muted">
                Finish joining with the invited email below, then continue into the workspace.
              </p>
            </div>
          </div>

          <div className="notice">
            Signed in as <strong>{session.sessionEmail}</strong>.
          </div>

          {params.error ? <div className="notice">{params.error}</div> : null}

          <form action={setPasswordAction} className="auth-form stack">
            <label className="field-label">
              New password
              <input
                autoComplete="new-password"
                autoFocus
                minLength={6}
                name="password"
                required
                type="password"
              />
            </label>

            <label className="field-label">
              Confirm password
              <input
                autoComplete="new-password"
                minLength={6}
                name="confirmPassword"
                required
                type="password"
              />
            </label>

            <div className="button-row">
              <button type="submit">Save password</button>
            </div>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-page stack">
      <section className="card auth-card stack">
        <div className="page-title">
          <div>
            <h2>Join Mandala</h2>
            <p className="muted">
              Open your invite email, then continue here to activate your account and set a
              password.
            </p>
          </div>
        </div>

        {params.error ? <div className="notice">{params.error}</div> : null}

        {hasInviteToken ? (
          <form action={claimInviteAction} className="auth-form stack">
            <input name="tokenHash" type="hidden" value={params.token_hash ?? ""} />
            <input name="type" type="hidden" value={params.type ?? ""} />

            <div className="notice">
              Continue to verify your invite and start setting your password.
            </div>

            <div className="button-row">
              <button type="submit">Continue</button>
              <Link className="secondary" href="/login">
                Back to login
              </Link>
            </div>
          </form>
        ) : (
          <>
            <div className="notice">
              Use the invite link from your email to begin. If the link expired, ask a partner or
              admin for help finishing your account setup.
            </div>

            <div className="button-row">
              <Link href="/login">Back to login</Link>
            </div>
          </>
        )}
      </section>
    </main>
  )
}
