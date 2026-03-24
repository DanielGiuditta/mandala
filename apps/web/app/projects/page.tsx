import { listPeopleOptions, listProjects } from "@mandala/db";
import { isProjectStage } from "@mandala/domain";

import { getViewerRequestContext } from "../../lib/auth/session";
import { ProjectsDomainList } from "../components/projects-domain-list";
import { createProjectAction } from "./actions";

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
  const [data, peopleData] = await Promise.all([
    listProjects(filters, viewerContext),
    listPeopleOptions(viewerContext),
  ]);
  const leadOptions = peopleData.forbidden
    ? []
    : peopleData.people;

  return (
    <main className="stack">
      <ProjectsDomainList
        createProjectAction={createProjectAction}
        data={data}
        leadOptions={leadOptions}
        leadOptionsUnavailable={peopleData.forbidden}
      />
    </main>
  );
}
