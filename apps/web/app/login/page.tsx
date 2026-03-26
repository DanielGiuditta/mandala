import Link from "next/link"
import { redirect } from "next/navigation"

import { getSafeNextPath } from "../../lib/auth/paths"
import { getAppSessionState } from "../../lib/auth/session"
import { AuthHashHandoff } from "../components/auth-hash-handoff"

import { signInAction } from "./actions"

interface LoginPageProps {
  searchParams: Promise<{
    email?: string
    error?: string
    next?: string
  }>
}

export const dynamic = "force-dynamic"

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams
  const nextPath = getSafeNextPath(params.next)
  const session = await getAppSessionState()

  if (session.configured && session.isAuthenticated) {
    redirect(nextPath)
  }

  if (!session.configured) {
    return (
      <main className="ui-page ui-auth-shell">
        <section className="ui-surface ui-card ui-auth-card">
          <div className="ui-copy">
            <h1 className="ui-card-title">Preview mode</h1>
            <p className="ui-meta">
              Supabase is not configured, so the app still runs against the seeded preview data
              path.
            </p>
          </div>

          <div className="ui-notice">
            Configure <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable real sign-in.
          </div>

          <div className="ui-actions">
            <Link className="ui-button ui-button-primary" href="/projects">
              Open preview workspace
            </Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="ui-page ui-auth-shell">
      <section className="ui-surface ui-card ui-auth-card">
        <div className="ui-copy">
          <h1 className="ui-card-title">Sign in</h1>
          <p className="ui-meta">
            Use the invited email and password for your linked <code>public.user_accounts</code>{" "}
            record. First-time users should open their invite email to set a password.
          </p>
        </div>

        <AuthHashHandoff />

        {params.error ? <div className="ui-notice">{params.error}</div> : null}

        <form action={signInAction} className="ui-stack">
          <input name="next" type="hidden" value={nextPath} />

          <label className="ui-field">
            <span className="ui-label">Email</span>
            <input
              autoComplete="email"
              className="ui-input"
              defaultValue={params.email ?? ""}
              name="email"
              required
              type="email"
            />
          </label>

          <label className="ui-field">
            <span className="ui-label">Password</span>
            <input
              autoComplete="current-password"
              className="ui-input"
              name="password"
              required
              type="password"
            />
          </label>

          <div className="ui-actions">
            <button className="ui-button ui-button-primary" type="submit">
              Sign in
            </button>
          </div>
        </form>

        <p className="ui-meta">
          If you can authenticate but still see no access, the matching row in{" "}
          <code>public.user_accounts</code> is missing or inactive.
        </p>
      </section>
    </main>
  )
}
