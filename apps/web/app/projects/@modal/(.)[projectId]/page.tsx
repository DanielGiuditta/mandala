import { createPerfTrace } from "@mandala/db";
import { notFound } from "next/navigation";

import { ProjectDetailOverlay } from "../../../components/projects/project-detail-overlay";
import {
  createProjectAction,
  loadPeopleOptionsAction,
  updateProjectAction,
} from "../../actions";
import { getViewerRequestContext } from "../../../../lib/auth/session";
import {
  getCachedProjectDetail,
  getCachedProjectRailData,
} from "../../data-cache";

interface ProjectDetailModalPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function ProjectDetailModalPage({
  params,
}: ProjectDetailModalPageProps) {
  const trace = createPerfTrace("app.projects.projectDetail.modal");
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
    <ProjectDetailOverlay
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
