import { notFound } from "next/navigation";

import { ProjectDetailOverlay } from "../../../components/projects/project-detail-overlay";
import { createProjectAction, loadPeopleOptionsAction } from "../../actions";
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
    <ProjectDetailOverlay
      createProjectAction={createProjectAction}
      data={data}
      loadPeopleOptionsAction={loadPeopleOptionsAction}
      officeOptions={railData.offices}
      projectId={projectId}
      railProjects={railData.projects}
    />
  );
}
