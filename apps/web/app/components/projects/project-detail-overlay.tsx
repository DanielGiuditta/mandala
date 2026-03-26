import type {
  CreateProjectInput,
  ProjectDetailData,
  ProjectRailItem,
  UpdateProjectInput,
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
  onUpdateProjectAction: (
    input: UpdateProjectInput,
  ) => Promise<{ projectId: string }>;
  projectId: string;
  railProjects: ProjectRailItem[];
}

export function ProjectDetailOverlay({
  createProjectAction,
  data,
  loadPeopleOptionsAction,
  officeOptions,
  onUpdateProjectAction,
  projectId,
  railProjects,
}: ProjectDetailOverlayProps) {
  return (
    <EntityModal
      panelClassName="entity-modal-panel-project-workspace"
      showBackdrop={false}
    >
      <ProjectDetailShell
        closeControl={<ProjectDetailCloseButton />}
        createProjectAction={createProjectAction}
        data={data}
        loadPeopleOptionsAction={loadPeopleOptionsAction}
        officeOptions={officeOptions}
        onUpdateProjectAction={onUpdateProjectAction}
        projectId={projectId}
        railProjects={railProjects}
      />
    </EntityModal>
  );
}
