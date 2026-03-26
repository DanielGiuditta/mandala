import { getAppSessionState } from "../lib/auth/session"
import { AuthHashHandoff } from "./components/auth-hash-handoff"
import ProjectsPage from "./projects/page"

export const dynamic = "force-dynamic"

interface HomePageProps {
  searchParams: Promise<{
    office?: string
    q?: string
    stage?: string
  }>
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const session = await getAppSessionState()

  if (!session.configured || session.isAuthenticated) {
    return <ProjectsPage searchParams={searchParams} />
  }

  return (
    <main className="ui-page ui-auth-shell">
      <section className="ui-surface ui-card ui-auth-card">
        <div className="ui-copy">
          <h1 className="ui-card-title">Opening workspace</h1>
          <p className="ui-meta">Finish sign-in or continue into the workspace.</p>
        </div>

        <AuthHashHandoff redirectIfNoHash={session.configured ? "/login" : "/projects"} />
      </section>
    </main>
  )
}
