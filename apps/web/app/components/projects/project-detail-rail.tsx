import type { ReactNode } from "react";

import { EntityHeader } from "../entity-header";
import { EntityReturnLink } from "../entity-return-link";
import type { ProjectRailItem } from "@mandala/db";
import {
  getFallbackAvatarInitial,
  getProjectFallbackAvatarStyle,
} from "./project-avatar-utils";

interface ProjectDetailRailProps {
  activeProjectId: string;
  configured: boolean;
  createProjectTrigger: ReactNode;
  forbidden: boolean;
  projects: ProjectRailItem[];
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
      <div className="projects-list-collapsed">
        {forbidden ? (
          <div className="projects-list-empty">
            No project access for the current viewer.
          </div>
        ) : projects.length === 0 ? (
          <div className="projects-list-empty">
            {configured
              ? "No projects are available."
              : "Configure the database connection to load projects."}
          </div>
        ) : (
          projects.map((project) => {
            const isActive = project.id === activeProjectId;

            return (
              <EntityReturnLink
                className={`projects-collapsed-row ${isActive ? "projects-collapsed-row-active" : ""}`}
                href={`/projects/${project.id}`}
                key={project.id}
                scope="projects"
                style={{ minWidth: 0 }}
              >
                {project.photoUrl ? (
                  <img
                    alt=""
                    aria-hidden
                    className="projects-project-thumb-image"
                    loading="lazy"
                    src={project.photoUrl}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="projects-project-thumb-fallback"
                    style={getProjectFallbackAvatarStyle(project.name, project.id)}
                  >
                    {getFallbackAvatarInitial(project.name, "P")}
                  </span>
                )}
                <span
                  className="projects-collapsed-row-text entity-content-link-grow entity-content-link-label"
                  title={project.name}
                >
                  {project.name}
                </span>
              </EntityReturnLink>
            );
          })
        )}
      </div>
    </aside>
  );
}
