import type { PersonDetailData } from "@mandala/db";

import { EntityReturnLink } from "../entity-return-link";
import { ProjectCardHeader } from "../projects/project-card-header";
import { Avatar, formatHoursWithUnit, formatInrMetric } from "./person-detail-utils";

interface PersonProjectsCardProps {
  person: NonNullable<PersonDetailData["person"]>;
  timeSummary: PersonDetailData["timeSummary"];
}

export function PersonProjectsCard({ person, timeSummary }: PersonProjectsCardProps) {
  const trackedProjectsById = new Map(
    timeSummary.byProject.map((project) => [project.projectId, project]),
  );
  const projects = person.staffedProjects.length
    ? person.staffedProjects.map((project) => {
        const trackedProject = trackedProjectsById.get(project.projectId);

        return {
          hours: trackedProject?.hours ?? 0,
          laborCost: trackedProject?.laborCost ?? null,
          projectId: project.projectId,
          projectName: project.projectName,
          projectPhotoUrl: project.projectPhotoUrl,
        };
      })
    : timeSummary.byProject.map((project) => ({
        ...project,
        projectPhotoUrl: null,
      }));

  return (
    <section className="pd-card">
      <ProjectCardHeader title="Sourced to" />
      <div className="pd-list">
        {projects.length === 0 ? (
          <p className="pd-empty">No tracked projects yet.</p>
        ) : (
          projects.map((project) => (
            <article className="pd-list-item" key={project.projectId}>
              <div className="pd-list-item-main">
                <EntityReturnLink
                  className="pd-person-chip entity-content-link"
                  href={`/projects/${project.projectId}`}
                  scope="projects"
                >
                  <Avatar
                    fallbackKey={project.projectId}
                    label={project.projectName}
                    photoUrl={project.projectPhotoUrl}
                    variant="project"
                  />
                  <span className="entity-content-link-label">{project.projectName}</span>
                </EntityReturnLink>
              </div>
              <div className="pd-list-item-aside">
                <span className="pd-meta-text">
                  {formatHoursWithUnit(project.hours)}
                  {project.laborCost !== null ? ` · ${formatInrMetric(project.laborCost)}` : ""}
                </span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
