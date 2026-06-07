"use client";

import { useMemo, useState } from "react";

import type { SelfTimeTrackerProjectOption } from "@mandala/db";

import { EntityReturnLink } from "../entity-return-link";
import { TokenIcon } from "../ui/token-icon";
import {
  getFallbackAvatarInitial,
  getProjectFallbackAvatarStyle,
} from "../projects/project-avatar-utils";
import {
  formatTrackerCurrency,
  formatTrackerHours,
} from "./time-tracker-formatters";

interface TimeTrackerListTableProps {
  configured: boolean;
  forbidden: boolean;
  projects: SelfTimeTrackerProjectOption[];
}

type SortKey = "project" | "hoursToday" | "totalHours" | "totalCost";
type SortDirection = "asc" | "desc";

interface ColumnDefinition {
  key: SortKey;
  label: string;
  width: number;
}

const COLUMN_DEFINITIONS: ColumnDefinition[] = [
  { key: "project", label: "Project", width: 250 },
  { key: "hoursToday", label: "Hours Today", width: 130 },
  { key: "totalHours", label: "Total Hours", width: 130 },
  { key: "totalCost", label: "Total Cost", width: 130 },
];
const GRID_COLUMN_GAP = 16;

export function TimeTrackerListTable({
  configured,
  forbidden,
  projects,
}: TimeTrackerListTableProps) {
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
        <TokenIcon
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
              96,
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
        case "hoursToday":
          result = compareNumber(left.todayHours, right.todayHours);
          break;
        case "totalHours":
          result = compareNumber(left.totalHours, right.totalHours);
          break;
        case "totalCost":
          result = compareNumber(left.totalCost ?? -1, right.totalCost ?? -1);
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
    <div className="projects-list">
      <div className="projects-list-columns" style={gridStyle}>
        {COLUMN_DEFINITIONS.map((column) => (
          <div className="projects-column-header-cell" key={column.key}>
            <HeaderLabel label={column.label} value={column.key} />
          </div>
        ))}
      </div>

      {forbidden ? (
        <div className="projects-list-empty">
          No time tracker access for the current viewer.
        </div>
      ) : projects.length === 0 ? (
        <div className="projects-list-empty">
          {configured
            ? "No active projects are available in the tracker right now."
            : "Configure the database connection to load time tracker data."}
        </div>
      ) : (
        sortedProjects.map((project, index) => (
          <article
            className={`projects-list-row ${index % 2 === 0 ? "projects-list-row-light" : "projects-list-row-base"}`}
            key={project.id}
            style={gridStyle}
          >
            <div className="projects-cell projects-cell-project">
              <EntityReturnLink
                className="entity-content-link entity-content-link-grow"
                href={`/projects/${project.id}`}
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
                <span className="projects-cell-value entity-content-link-label">
                  {project.name}
                </span>
              </EntityReturnLink>
            </div>
            <div className="projects-cell projects-cell-metric">
              <span className="projects-cell-value">
                {formatTrackerHours(project.todayHours)}
              </span>
            </div>
            <div className="projects-cell projects-cell-metric">
              <span className="projects-cell-value">
                {formatTrackerHours(project.totalHours)}
              </span>
            </div>
            <div className="projects-cell projects-cell-metric">
              <span className="projects-cell-value">
                {formatTrackerCurrency(project.totalCost)}
              </span>
            </div>
          </article>
        ))
      )}
    </div>
  );
}
