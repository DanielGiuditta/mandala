import type { ReactNode } from "react";

import type { ProjectListItem } from "@mandala/db";

import { EntityHeader } from "../entity-header";
import { ProjectListTable } from "./project-list-table";

interface ProjectDetailRailProps {
  activeProjectId: string;
  configured: boolean;
  createProjectTrigger: ReactNode;
  forbidden: boolean;
  projects: ProjectListItem[];
}

export function ProjectDetailRail({
  activeProjectId,
  configured,
  createProjectTrigger,
  forbidden,
  projects,
}: ProjectDetailRailProps) {
  return (
    <aside className="pd-rail">
      <EntityHeader
        action={createProjectTrigger}
        className="pd-rail-header"
        title="Projects"
      />
      <ProjectListTable
        activeProjectId={activeProjectId}
        configured={configured}
        forbidden={forbidden}
        mode="collapsed"
        projects={projects}
      />
    </aside>
  );
}
