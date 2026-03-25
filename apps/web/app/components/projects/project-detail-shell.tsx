import type {
  CreateProjectInput,
  ProjectDetailData,
  ProjectRailItem,
  UpdateProjectInput,
} from "@mandala/db";
import type { ReactNode } from "react";

import { ProjectDetailRail } from "./project-detail-rail";
import { ProjectDetailEntity } from "./project-detail-entity";
import { ProjectCreateModal } from "./project-create-modal";
import type {
  ProjectCreateOfficeOption,
} from "./project-create-types";

interface ProjectDetailShellProps {
  closeControl?: ReactNode;
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

export function ProjectDetailShell({
  closeControl,
  createProjectAction,
  data,
  loadPeopleOptionsAction,
  officeOptions,
  onUpdateProjectAction,
  projectId,
  railProjects,
}: ProjectDetailShellProps) {
  if (data.forbidden) {
    const message =
      data.accessMessage ??
      "This viewer does not have access to the requested project.";

    return (
      <main className="pd-page">
        <section className="pd-card">
          <div className="pd-card-header">
            <h2 className="pd-card-title">Project access</h2>
          </div>
          <p className="pd-empty">{message}</p>
          {data.viewerLabel ? <p className="pd-meta-text">Viewer: {data.viewerLabel}</p> : null}
          {!data.configured && data.configMessage ? (
            <p className="pd-meta-text">{data.configMessage}</p>
          ) : null}
        </section>
      </main>
    );
  }

  if (!data.project) {
    return (
      <main className="pd-page">
        <section className="pd-card">
          <h2 className="pd-card-title">Project detail</h2>
          <p className="pd-empty">Configure the database connection to load live project data.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="pd-page">
      <div className="pd-layout">
        <ProjectDetailRail
          activeProjectId={projectId}
          configured={data.configured}
          createProjectTrigger={
            <ProjectCreateModal
              loadLeadOptionsAction={loadPeopleOptionsAction}
              officeOptions={officeOptions}
              onCreateProjectAction={createProjectAction}
            />
          }
          forbidden={data.forbidden}
          projects={railProjects}
        />
        <ProjectDetailEntity
          closeControl={closeControl}
          data={data}
          loadPeopleOptionsAction={loadPeopleOptionsAction}
          officeOptions={officeOptions}
          onUpdateProjectAction={onUpdateProjectAction}
          projectId={projectId}
        />
      </div>
    </main>
  );
}
