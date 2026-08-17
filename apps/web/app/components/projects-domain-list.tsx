import type {
  CreateProjectInput,
  PeopleOptionRow,
  ProjectListData,
  UpdateProjectInput,
} from "@mandala/db";

import { EntityHeader } from "./entity-header";
import { ProjectListFilters } from "./projects/project-list-filters";
import { ProjectCreateModal } from "./projects/project-create-modal";
import { ProjectListTable } from "./projects/project-list-table";

interface ProjectsDomainListProps {
  createProjectAction: (
    input: CreateProjectInput,
  ) => Promise<{ projectId: string }>;
  data: ProjectListData;
  loadPeopleOptionsAction: () => Promise<{
    forbidden: boolean;
    people: PeopleOptionRow[];
  }>;
  onUpdateProjectAction: (
    input: UpdateProjectInput,
  ) => Promise<{ projectId: string }>;
}

export function ProjectsDomainList({
  createProjectAction,
  data,
  loadPeopleOptionsAction,
  onUpdateProjectAction,
}: ProjectsDomainListProps) {
  const projectCreateDisabledReason = data.activeWorkProjectId
    ? `You are currently tracking ${data.activeWorkProjectName ?? "another project"}. Stop work before creating a project.`
    : undefined;

  return (
    <section className="projects-domain">
      <EntityHeader
        action={
          <ProjectCreateModal
            disabled={Boolean(data.activeWorkProjectId)}
            disabledReason={projectCreateDisabledReason}
            loadLeadOptionsAction={loadPeopleOptionsAction}
            officeOptions={data.offices}
            onCreateProjectAction={createProjectAction}
          />
        }
        className="projects-domain-header"
        title="Projects"
      />

      <ProjectListFilters forbidden={data.forbidden} filters={data.filters} />
      <ProjectListTable
        configured={data.configured}
        forbidden={data.forbidden}
        loadPeopleOptionsAction={loadPeopleOptionsAction}
        onUpdateProjectAction={onUpdateProjectAction}
        projects={data.projects}
      />

      {data.activeWorkProjectId ? (
        <div className="projects-notice-dock">
          <div className="notice">
            Viewing only outside {data.activeWorkProjectName ?? "the active project"}.
          </div>
        </div>
      ) : null}

      {!data.configured && data.configMessage ? (
        <div className="projects-notice-dock">
          <div className="notice">{data.configMessage}</div>
          {data.accessMessage ? (
            <div className="notice">{data.accessMessage}</div>
          ) : null}
        </div>
      ) : data.accessMessage ? (
        <div className="projects-notice-dock">
          <div className="notice">{data.accessMessage}</div>
        </div>
      ) : null}
    </section>
  );
}
