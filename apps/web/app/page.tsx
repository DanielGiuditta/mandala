import { AuthHashHandoff } from "./components/auth-hash-handoff"

export default function HomePage() {
  return (
    <main className="auth-page stack">
      <section className="card auth-card stack">
        <div className="page-title">
          <div>
            <h2>Opening workspace</h2>
            <p className="muted">
              Finish sign-in or continue into the workspace.
            </p>
          </div>
        </div>

        <AuthHashHandoff redirectIfNoHash="/projects" />
      </section>
    </main>
  )
}
