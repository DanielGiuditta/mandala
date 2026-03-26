import { createPerfTrace } from "@mandala/db";
import { isProjectStage } from "@mandala/domain";

import { getViewerRequestContext } from "../../lib/auth/session";
import { ProjectsDomainList } from "../components/projects-domain-list";
import {
  createProjectAction,
  loadPeopleOptionsAction,
  updateProjectAction,
} from "./actions";
import { getCachedProjects } from "./data-cache";

interface ProjectsPageProps {
  searchParams: Promise<{
    office?: string;
    q?: string;
    stage?: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function ProjectsPage({
  searchParams,
}: ProjectsPageProps) {
  const trace = createPerfTrace("app.projects.page")
  const params = await trace.measure("resolveSearchParams", () => searchParams)
  const viewerContext = await trace.measure("getViewerRequestContext", () =>
    getViewerRequestContext(),
  )
  const filters = {
    officeId: params.office || undefined,
    query: params.q || undefined,
    stage:
      params.stage && isProjectStage(params.stage) ? params.stage : undefined,
  };
  const data = await trace.measure("getCachedProjects", () =>
    getCachedProjects(filters, viewerContext),
  )

  trace.finish({
    forbidden: data.forbidden,
    hasOfficeFilter: Boolean(filters.officeId),
    hasQuery: Boolean(filters.query),
    projectCount: data.projects.length,
    result: "ok",
    stage: filters.stage ?? null,
  })

  return (
    <main className="stack">
      <ProjectsDomainList
        createProjectAction={createProjectAction}
        data={data}
        loadPeopleOptionsAction={loadPeopleOptionsAction}
        onUpdateProjectAction={updateProjectAction}
      />
    </main>
  );
}
