import Link from "next/link"
import { redirect } from "next/navigation"

import { getSafeNextPath } from "../../lib/auth/paths"
import { getAppSessionState } from "../../lib/auth/session"

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
      <main className="auth-page stack">
        <section className="card auth-card stack">
          <div className="page-title">
            <div>
              <h2>Preview mode</h2>
              <p className="muted">
                Supabase is not configured, so the app still runs against the seeded preview
                data path.
              </p>
            </div>
          </div>

          <div className="notice">
            Configure <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
            <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable real sign-in.
          </div>

          <div className="button-row">
            <Link href="/projects">Open preview workspace</Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="auth-page stack">
      <section className="card auth-card stack">
        <div className="page-title">
          <div>
            <h2>Sign in</h2>
            <p className="muted">
              Use the invited email and password for your linked <code>public.user_accounts</code>{" "}
              record. First-time users should open their invite email to set a password.
            </p>
          </div>
        </div>

        {params.error ? <div className="notice">{params.error}</div> : null}

        <form action={signInAction} className="auth-form stack">
          <input name="next" type="hidden" value={nextPath} />

          <label className="field-label">
            Email
            <input
              autoComplete="email"
              defaultValue={params.email ?? ""}
              name="email"
              required
              type="email"
            />
          </label>

          <label className="field-label">
            Password
            <input
              autoComplete="current-password"
              name="password"
              required
              type="password"
            />
          </label>

          <div className="button-row">
            <button type="submit">Sign in</button>
          </div>
        </form>

        <p className="muted">
          If you can authenticate but still see no access, the matching row in{" "}
          <code>public.user_accounts</code> is missing or inactive.
        </p>
      </section>
    </main>
  )
}
