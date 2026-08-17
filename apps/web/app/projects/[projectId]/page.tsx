import { createPerfTrace } from "@mandala/db";
import { notFound } from "next/navigation";

import { ProjectDetailShell } from "../../components/projects/project-detail-shell";
import {
  createProjectAction,
  loadPeopleOptionsAction,
  updateProjectAction,
} from "../actions";
import { getViewerRequestContext } from "../../../lib/auth/session";
import {
  getCachedProjectDetail,
  getCachedProjectRailData,
} from "../data-cache";

interface ProjectDetailPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const trace = createPerfTrace("app.projects.projectDetail.page");
  const { projectId } = await trace.measure("resolveParams", () => params);
  const viewerContext = await trace.measure("getViewerRequestContext", () =>
    getViewerRequestContext(),
  );
  const [data, railData] = await trace.measure("loadDetailShellData", () =>
    Promise.all([
      getCachedProjectDetail(projectId, viewerContext),
      getCachedProjectRailData(viewerContext),
    ]),
  );

  if (data.configured && !data.project && !data.forbidden) {
    notFound();
  }

  trace.finish({
    forbidden: data.forbidden,
    hasProject: Boolean(data.project),
    railCount: railData.projects.length,
    result: "ok",
  });

  return (
    <ProjectDetailShell
      createProjectAction={createProjectAction}
      data={data}
      loadPeopleOptionsAction={loadPeopleOptionsAction}
      officeOptions={railData.offices}
      onUpdateProjectAction={updateProjectAction}
      projectId={projectId}
      railProjects={railData.projects}
    />
  );
}
