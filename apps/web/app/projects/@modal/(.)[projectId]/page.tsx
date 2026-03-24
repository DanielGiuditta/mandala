import { notFound } from "next/navigation";

import { ProjectDetailOverlay } from "../../../components/projects/project-detail-overlay";
import { loadPeopleOptionsAction } from "../../actions";
import { getViewerRequestContext } from "../../../../lib/auth/session";
import { getCachedProjectDetail } from "../../data-cache";

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
  const data = await getCachedProjectDetail(projectId, viewerContext);

  if (data.configured && !data.project && !data.forbidden) {
    notFound();
  }

  return (
    <ProjectDetailOverlay
      data={data}
      loadPeopleOptionsAction={loadPeopleOptionsAction}
      projectId={projectId}
    />
  );
}
