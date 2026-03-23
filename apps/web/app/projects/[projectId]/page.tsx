import { listPeople, listProjects, getProjectDetail } from "@mandala/db";
import { notFound } from "next/navigation";

import { ProjectDetailShell } from "../../components/projects/project-detail-shell";
import { createProjectAction } from "../actions";
import { getViewerRequestContext } from "../../../lib/auth/session";

interface ProjectDetailPageProps {
  params: Promise<{
    projectId: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({ params }: ProjectDetailPageProps) {
  const { projectId } = await params;
  const viewerContext = await getViewerRequestContext();
  const [data, railData, peopleData] = await Promise.all([
    getProjectDetail(projectId, viewerContext),
    listProjects({}, viewerContext),
    listPeople({}, viewerContext),
  ]);

  if (data.configured && !data.project && !data.forbidden) {
    notFound();
  }

  const peopleOptions = peopleData.forbidden
    ? []
    : peopleData.people
        .filter((person) => person.active)
        .map((person) => ({ id: person.id, fullName: person.fullName }));

  return (
    <ProjectDetailShell
      createProjectAction={createProjectAction}
      data={data}
      leadOptions={peopleOptions}
      leadOptionsUnavailable={peopleData.forbidden}
      officeOptions={railData.offices}
      peopleOptions={peopleOptions}
      projectId={projectId}
      railProjects={railData.projects}
    />
  );
}
