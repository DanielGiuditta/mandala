"use client";

import { useMemo, useState } from "react";

import type { ProjectListItem } from "@mandala/db";

import {
  formatCurrency,
  formatHours,
  formatLeadName,
  formatOfficeRelationship,
  formatStageLabel,
  stageIcon,
} from "./projects-formatters";
import {
  getFallbackAvatarInitial,
  getPersonFallbackAvatarStyle,
  getProjectFallbackAvatarStyle,
} from "./project-avatar-utils";
import { EntityReturnLink } from "../entity-return-link";

interface ProjectListTableProps {
  activeProjectId?: string;
  configured: boolean;
  forbidden: boolean;
  mode?: "collapsed" | "table";
  projects: ProjectListItem[];
}

type SortKey =
  | "project"
  | "client"
  | "office"
  | "lead"
  | "stage"
  | "hours"
  | "cost";
type SortDirection = "asc" | "desc";
type ColumnKey = SortKey;

interface ColumnDefinition {
  key: ColumnKey;
  label: string;
  minWidth: number;
  width: number;
}

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: "project", label: "Project", minWidth: 180, width: 250 },
  { key: "client", label: "Client", minWidth: 150, width: 210 },
  { key: "office", label: "Office", minWidth: 220, width: 260 },
  { key: "lead", label: "Lead", minWidth: 145, width: 180 },
  { key: "stage", label: "Stage", minWidth: 120, width: 140 },
  { key: "hours", label: "Hours", minWidth: 92, width: 110 },
  { key: "cost", label: "Cost", minWidth: 110, width: 120 },
];
const GRID_COLUMN_GAP = 16;

export function ProjectListTable({
  activeProjectId,
  configured,
  forbidden,
  mode = "table",
  projects,
}: ProjectListTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("project");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [hasUserSorted, setHasUserSorted] = useState(false);

  function toggleSort(nextKey: SortKey) {
    setHasUserSorted(true);

    if (sortKey === nextKey) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }

    setSortKey(nextKey);
    setSortDirection("asc");
  }

  function HeaderLabel({ label, value }: { label: string; value: SortKey }) {
    const isActive = hasUserSorted && sortKey === value;
    const directionLabel =
      isActive && sortDirection === "desc" ? "descending" : "ascending";
    const iconClassName = `projects-sort-icon ${
      isActive
        ? sortDirection === "desc"
          ? "projects-sort-icon-desc"
          : "projects-sort-icon-asc"
        : ""
    }`;

    return (
      <button
        aria-label={`Sort by ${label}, ${directionLabel}`}
        className="projects-column-label"
        onClick={() => toggleSort(value)}
        type="button"
      >
        <span className="projects-column-label-text">{label}</span>
        <img
          alt=""
          aria-hidden
          className={iconClassName}
          src="/figma/projects/sort-icon.svg"
        />
      </button>
    );
  }

  const gridStyle = useMemo(() => {
    const preferredWidths = COLUMN_DEFINITIONS.map((column) => column.width);
    const preferredTotal = preferredWidths.reduce((total, width) => total + width, 0);
    const gapTotal = (COLUMN_DEFINITIONS.length - 1) * GRID_COLUMN_GAP;
    const availableTracks = Math.max(0, preferredTotal - gapTotal);

    const renderedWidths =
      preferredTotal > 0 && availableTracks > 0
        ? preferredWidths.map((width) =>
            Math.max(
              56,
              Math.round((width / preferredTotal) * availableTracks),
            ),
          )
        : preferredWidths;

    return {
      gridTemplateColumns: renderedWidths
        .map((width) => `${width}px`)
        .join(" "),
    };
  }, []);

  const sortedProjects = useMemo(() => {
    const items = [...projects];
    const direction = sortDirection === "asc" ? 1 : -1;

    function compareText(left: string, right: string): number {
      return left.localeCompare(right, undefined, { sensitivity: "base" });
    }

    function compareNumber(left: number, right: number): number {
      return left - right;
    }

    items.sort((left, right) => {
      let result = 0;

      switch (sortKey) {
        case "project":
          result = compareText(left.name, right.name);
          break;
        case "client":
          result = compareText(left.clientName ?? "", right.clientName ?? "");
          break;
        case "office":
          result = compareText(
            formatOfficeRelationship(left),
            formatOfficeRelationship(right),
          );
          break;
        case "lead":
          result = compareText(formatLeadName(left), formatLeadName(right));
          break;
        case "stage":
          result = compareText(
            formatStageLabel(left.stage),
            formatStageLabel(right.stage),
          );
          break;
        case "hours":
          result = compareNumber(
            left.plannedHoursPerWeek ?? -1,
            right.plannedHoursPerWeek ?? -1,
          );
          break;
        case "cost":
          result = compareNumber(
            left.roughLaborCost ?? -1,
            right.roughLaborCost ?? -1,
          );
          break;
      }

      if (result !== 0) {
        return result * direction;
      }

      return compareText(left.name, right.name) * direction;
    });

    return items;
  }, [projects, sortDirection, sortKey]);

  return (
    <div className={mode === "collapsed" ? "projects-list-collapsed" : "projects-list"}>
      {mode === "table" ? (
        <div className="projects-list-columns" style={gridStyle}>
          {COLUMN_DEFINITIONS.map((column) => (
            <div className="projects-column-header-cell" key={column.key}>
              <HeaderLabel label={column.label} value={column.key} />
            </div>
          ))}
        </div>
      ) : null}

      {forbidden ? (
        <div className="projects-list-empty">
          No project access for the current viewer.
        </div>
      ) : projects.length === 0 ? (
        <div className="projects-list-empty">
          {configured
            ? "No projects match the current filters."
            : "Configure the database connection to load projects."}
        </div>
      ) : mode === "collapsed" ? (
        sortedProjects.map((project) => {
          const isActive = project.id === activeProjectId;

          return (
            <EntityReturnLink
              className={`projects-collapsed-row ${isActive ? "projects-collapsed-row-active" : ""}`}
              href={`/projects/${project.id}`}
              key={project.id}
              scope="projects"
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
              <span className="projects-collapsed-row-text">{project.name}</span>
            </EntityReturnLink>
          );
        })
      ) : (
        sortedProjects.map((project, index) => (
          <article
            className={`projects-list-row ${index % 2 === 0 ? "projects-list-row-light" : "projects-list-row-base"}`}
            key={project.id}
            style={gridStyle}
          >
            <div className="projects-cell projects-cell-project">
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
              <EntityReturnLink href={`/projects/${project.id}`} scope="projects">
                {project.name}
              </EntityReturnLink>
            </div>
            <div className="projects-cell">
              <span className="projects-cell-value">
                {project.clientName ?? "Unassigned"}
              </span>
            </div>
            <div className="projects-cell projects-cell-office">
              <span className="projects-cell-value projects-office-value">
                {formatOfficeRelationship(project)}
              </span>
            </div>
            <div className="projects-cell">
              <span className="projects-lead-pill">
                {project.leadPersonPhotoUrl ? (
                  <img
                    alt=""
                    aria-hidden
                    className="projects-lead-avatar-image"
                    loading="lazy"
                    src={project.leadPersonPhotoUrl}
                  />
                ) : (
                  <span
                    aria-hidden
                    className="projects-lead-avatar-fallback"
                    style={getPersonFallbackAvatarStyle(
                      formatLeadName(project),
                      project.leadPersonId ?? project.id,
                    )}
                  >
                    {getFallbackAvatarInitial(formatLeadName(project), "L")}
                  </span>
                )}
                <span className="projects-lead-pill-text">
                  {formatLeadName(project)}
                </span>
              </span>
            </div>
            <div className="projects-cell">
              <span className="projects-stage-text">
                <span aria-hidden className="projects-inline-icon">
                  {stageIcon(project.stage)}
                </span>
                <span className="projects-cell-value">
                  {formatStageLabel(project.stage)}
                </span>
              </span>
            </div>
            <div className="projects-cell projects-cell-metric">
              <span
                className={
                  project.restrictedToSummary
                    ? "projects-missing-attribute"
                    : ""
                }
              >
                {formatHours(project.plannedHoursPerWeek)}
              </span>
            </div>
            <div className="projects-cell projects-cell-metric">
              <span
                className={
                  project.restrictedToSummary
                    ? "projects-missing-attribute"
                    : ""
                }
              >
                {formatCurrency(project.roughLaborCost)}
              </span>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
