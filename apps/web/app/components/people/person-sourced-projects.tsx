"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import type { PersonListItem } from "@mandala/db";

import { EntityReturnLink } from "../entity-return-link";
import { DropdownActionMenu } from "../ui/dropdown";
import {
  getFallbackAvatarInitial,
  getProjectFallbackAvatarStyle,
} from "../projects/project-avatar-utils";
import { Avatar } from "./person-detail-utils";

type SourcedProject = PersonListItem["staffedProjects"][number];

interface PersonSourcedProjectsProps {
  personName: string;
  projects: SourcedProject[];
  variant: "detail" | "list";
}

function SourcedProjectLink({
  project,
  variant,
}: {
  project: SourcedProject;
  variant: "detail" | "list";
}) {
  if (variant === "detail") {
    return (
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
    );
  }

  return (
    <EntityReturnLink
      className="people-project-chip entity-content-link"
      href={`/projects/${project.projectId}`}
      scope="projects"
    >
      {project.projectPhotoUrl ? (
        <img
          alt=""
          aria-hidden
          className="people-project-chip-avatar"
          loading="lazy"
          src={project.projectPhotoUrl}
        />
      ) : (
        <span
          aria-hidden
          className="people-project-chip-fallback"
          style={getProjectFallbackAvatarStyle(project.projectName, project.projectId)}
        >
          {getFallbackAvatarInitial(project.projectName)}
        </span>
      )}
      <span className="people-cell-value entity-content-link-label">
        {project.projectName}
      </span>
    </EntityReturnLink>
  );
}

export function PersonSourcedProjects({
  personName,
  projects,
  variant,
}: PersonSourcedProjectsProps) {
  const router = useRouter();
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const visibleProjects = projects.slice(0, 2);
  const overflowProjects = projects.slice(2);
  const isDetail = variant === "detail";

  function renderOverflowMenu() {
    if (overflowProjects.length === 0) {
      return null;
    }

    const overflowMenu = (
      <DropdownActionMenu
        align="start"
        className={isDetail ? "pd-glance-project-overflow-menu" : "people-project-overflow-menu"}
        items={overflowProjects.map((project) => ({
          id: project.projectId,
          label: project.projectName,
          leadingVisual: (
            <Avatar
              fallbackKey={project.projectId}
              label={project.projectName}
              photoUrl={project.projectPhotoUrl}
              variant="project"
            />
          ),
          leadingVisualShape: "circle" as const,
          onSelect: () => router.push(`/projects/${project.projectId}`),
        }))}
        menuClassName={
          isDetail
            ? "pd-glance-project-overflow-surface"
            : "people-project-overflow-surface"
        }
        menuMinWidth={260}
        onOpenChange={isDetail ? setIsOverflowOpen : undefined}
        open={isDetail ? isOverflowOpen : undefined}
        trigger={`+${overflowProjects.length}`}
        triggerAriaLabel={`Show ${overflowProjects.length} more projects sourced to ${personName}`}
        triggerClassName={
          isDetail
            ? "pd-glance-project-overflow-trigger"
            : "people-project-overflow-trigger"
        }
      />
    );

    if (!isDetail) {
      return overflowMenu;
    }

    return (
      <span
        className="pd-glance-project-overflow"
        onMouseEnter={() => setIsOverflowOpen(true)}
        onMouseLeave={() => setIsOverflowOpen(false)}
      >
        {overflowMenu}
      </span>
    );
  }

  return (
    <div
      aria-label={`Projects sourced to ${personName}`}
      className={isDetail ? "pd-glance-projects" : "people-project-chips"}
      title={projects.map((project) => project.projectName).join(", ")}
    >
      {isDetail ? (
        <div className="pd-glance-project-links">
          {visibleProjects.map((project) => (
            <SourcedProjectLink key={project.projectId} project={project} variant={variant} />
          ))}
        </div>
      ) : (
        visibleProjects.map((project) => (
          <SourcedProjectLink key={project.projectId} project={project} variant={variant} />
        ))
      )}
      {renderOverflowMenu()}
    </div>
  );
}
