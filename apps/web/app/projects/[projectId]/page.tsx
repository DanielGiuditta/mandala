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
  const { projectId } = await params;
  const viewerContext = await getViewerRequestContext();
  const [data, railData] = await Promise.all([
    getCachedProjectDetail(projectId, viewerContext),
    getCachedProjectRailData(viewerContext),
  ]);

  if (data.configured && !data.project && !data.forbidden) {
    notFound();
  }

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
