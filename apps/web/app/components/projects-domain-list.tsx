import type { CreateProjectInput, ProjectListData } from "@mandala/db";

import { EntityHeader } from "./entity-header";
import type { ProjectCreateLeadOption } from "./projects/project-create-types";
import { ProjectListFilters } from "./projects/project-list-filters";
import { ProjectCreateModal } from "./projects/project-create-modal";
import { ProjectListTable } from "./projects/project-list-table";

interface ProjectsDomainListProps {
  createProjectAction: (
    input: CreateProjectInput,
  ) => Promise<{ projectId: string }>;
  data: ProjectListData;
  leadOptions: ProjectCreateLeadOption[];
  leadOptionsUnavailable: boolean;
}

export function ProjectsDomainList({
  createProjectAction,
  data,
  leadOptions,
  leadOptionsUnavailable,
}: ProjectsDomainListProps) {
  return (
    <section className="projects-domain">
      <EntityHeader
        action={
          <ProjectCreateModal
            leadOptions={leadOptions}
            leadOptionsUnavailable={leadOptionsUnavailable}
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
        projects={data.projects}
      />

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
