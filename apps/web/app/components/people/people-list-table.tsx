"use client";

import { useMemo, useState } from "react";

import type { PersonListItem } from "@mandala/db";

import { PeopleListRow } from "./people-list-row";

interface PeopleListTableProps {
  configured: boolean;
  forbidden: boolean;
  people: PersonListItem[];
}

type SortKey =
  | "name"
  | "staffedTo"
  | "office"
  | "supervisor"
  | "hours"
  | "permission"
  | "role"
  | "salary";
type SortDirection = "asc" | "desc";

const PEOPLE_COLUMNS: Array<{ key: SortKey; label: string }> = [
  { key: "name", label: "Name" },
  { key: "staffedTo", label: "Staffed to" },
  { key: "office", label: "Office" },
  { key: "supervisor", label: "Supervisor" },
  { key: "hours", label: "Hours /wk" },
  { key: "permission", label: "Permission" },
  { key: "role", label: "Role" },
  { key: "salary", label: "Salary" },
];

export function PeopleListTable({
  configured,
  forbidden,
  people,
}: PeopleListTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
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
    const iconClassName = `people-sort-icon ${
      isActive
        ? sortDirection === "desc"
          ? "people-sort-icon-desc"
          : "people-sort-icon-asc"
        : ""
    }`;

    return (
      <button
        aria-label={`Sort by ${label}, ${directionLabel}`}
        className="people-column-button"
        onClick={() => toggleSort(value)}
        type="button"
      >
        <span className="people-column-label">{label}</span>
        <img
          alt=""
          aria-hidden
          className={iconClassName}
          src="/figma/projects/sort-icon.svg"
        />
      </button>
    );
  }

  const sortedPeople = useMemo(() => {
    const items = [...people];
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
        case "name":
          result = compareText(left.fullName, right.fullName);
          break;
        case "staffedTo":
          result = compareText(
            left.staffedProjects.map((project) => project.projectName).join(", "),
            right.staffedProjects.map((project) => project.projectName).join(", "),
          );
          break;
        case "office":
          result = compareText(left.officeName, right.officeName);
          break;
        case "supervisor":
          result = compareText(left.supervisorName ?? "", right.supervisorName ?? "");
          break;
        case "hours":
          result = compareNumber(left.hoursThisWeek, right.hoursThisWeek);
          break;
        case "permission":
          result = compareText(
            left.effectivePermissionLabel ?? "",
            right.effectivePermissionLabel ?? "",
          );
          break;
        case "role":
          result = compareText(left.title ?? "", right.title ?? "");
          break;
        case "salary":
          result = compareNumber(left.annualSalary, right.annualSalary);
          break;
      }

      if (result !== 0) {
        return result * direction;
      }

      return compareText(left.fullName, right.fullName) * direction;
    });

    return items;
  }, [people, sortDirection, sortKey]);

  return (
    <div className="people-list">
      {!forbidden ? (
        <div className="people-list-columns">
          {PEOPLE_COLUMNS.map((column) => (
            <div className="people-column-cell" key={column.key}>
              <HeaderLabel label={column.label} value={column.key} />
            </div>
          ))}
        </div>
      ) : null}

      {forbidden ? (
        <div className="people-list-empty">
          No people access for the current viewer.
        </div>
      ) : people.length === 0 ? (
        <div className="people-list-empty">
          {configured
            ? "No people match the current filters."
            : "Configure the database connection to load people."}
        </div>
      ) : (
        sortedPeople.map((person, index) => (
          <PeopleListRow key={person.id} person={person} rowIndex={index} />
        ))
      )}
    </div>
  );
}
