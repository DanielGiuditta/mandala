import type {
  CreateProjectInput,
  ProjectDetailData,
  ProjectRailItem,
} from "@mandala/db";

import { EntityModal } from "../entity-modal";
import { ProjectDetailCloseButton } from "./project-detail-close-button";
import { ProjectDetailShell } from "./project-detail-shell";
import type { ProjectCreateOfficeOption } from "./project-create-types";

interface ProjectDetailOverlayProps {
  createProjectAction: (
    input: CreateProjectInput,
  ) => Promise<{ projectId: string }>;
  data: ProjectDetailData;
  loadPeopleOptionsAction: () => Promise<{
    forbidden: boolean;
    people: Array<{ fullName: string; id: string }>;
  }>;
  officeOptions: ProjectCreateOfficeOption[];
  projectId: string;
  railProjects: ProjectRailItem[];
}

export function ProjectDetailOverlay({
  createProjectAction,
  data,
  loadPeopleOptionsAction,
  officeOptions,
  projectId,
  railProjects,
}: ProjectDetailOverlayProps) {
  return (
    <EntityModal
      panelClassName="entity-modal-panel-project-workspace"
      showBackdrop={false}
    >
      <ProjectDetailShell
        closeControl={<ProjectDetailCloseButton preferBack />}
        createProjectAction={createProjectAction}
        data={data}
        loadPeopleOptionsAction={loadPeopleOptionsAction}
        officeOptions={officeOptions}
        projectId={projectId}
        railProjects={railProjects}
      />
    </EntityModal>
  );
}
