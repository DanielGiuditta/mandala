import { isProjectStage } from "@mandala/domain";

import { getViewerRequestContext } from "../../lib/auth/session";
import { ProjectsDomainList } from "../components/projects-domain-list";
import { createProjectAction, loadPeopleOptionsAction } from "./actions";
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
  const params = await searchParams;
  const viewerContext = await getViewerRequestContext();
  const filters = {
    officeId: params.office || undefined,
    query: params.q || undefined,
    stage:
      params.stage && isProjectStage(params.stage) ? params.stage : undefined,
  };
  const data = await getCachedProjects(filters, viewerContext);

  return (
    <main className="stack">
      <ProjectsDomainList
        createProjectAction={createProjectAction}
        data={data}
        loadPeopleOptionsAction={loadPeopleOptionsAction}
      />
    </main>
  );
}
