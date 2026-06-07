"use client";

import { useMemo, useState } from "react";

import type { PersonListItem, UpdatePersonInput } from "@mandala/db";

import { PeopleListRow } from "./people-list-row";
import type { PersonMutationActionResult } from "./person-action-results";
import type { PersonCreateOfficeOption, PersonCreateSupervisorOption } from "./person-create-types";
import { TokenIcon } from "../ui/token-icon";

interface PeopleListTableProps {
  configured: boolean;
  forbidden: boolean;
  loadProjectOptionsAction: () => Promise<{
    forbidden: boolean;
    projects: Array<{ id: string; name: string; photoUrl: string | null }>;
  }>;
  loadSupervisorOptionsAction: () => Promise<{
    forbidden: boolean;
    people: PersonCreateSupervisorOption[];
  }>;
  officeOptions: PersonCreateOfficeOption[];
  onAddProjectAction: (
    input: { personId: string; projectId: string },
  ) => Promise<{ error: string | null; ok: boolean }>;
  onUpdatePersonAction: (
    input: UpdatePersonInput,
  ) => Promise<PersonMutationActionResult>;
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
  loadProjectOptionsAction,
  loadSupervisorOptionsAction,
  officeOptions,
  onAddProjectAction,
  onUpdatePersonAction,
  people,
}: PeopleListTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [hasUserSorted, setHasUserSorted] = useState(false);
  const [projectOptions, setProjectOptions] = useState<
    Array<{ id: string; name: string; photoUrl: string | null }>
  >([]);
  const [projectOptionsStatus, setProjectOptionsStatus] = useState<
    "idle" | "loading" | "ready" | "unavailable" | "error"
  >("idle");
  const [supervisorOptions, setSupervisorOptions] = useState<PersonCreateSupervisorOption[]>([]);
  const [supervisorOptionsStatus, setSupervisorOptionsStatus] = useState<
    "idle" | "loading" | "ready" | "unavailable" | "error"
  >("idle");

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
        <TokenIcon
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
          result = compareNumber(left.annualSalary ?? -1, right.annualSalary ?? -1);
          break;
      }

      if (result !== 0) {
        return result * direction;
      }

      return compareText(left.fullName, right.fullName) * direction;
    });

    return items;
  }, [people, sortDirection, sortKey]);

  async function ensureProjectOptions() {
    if (projectOptionsStatus === "ready" || projectOptionsStatus === "loading") {
      return;
    }

    setProjectOptionsStatus("loading");

    try {
      const result = await loadProjectOptionsAction();

      if (result.forbidden) {
        setProjectOptions([]);
        setProjectOptionsStatus("unavailable");
        throw new Error("Project options are unavailable for the current viewer.");
      }

      setProjectOptions(result.projects);
      setProjectOptionsStatus("ready");
    } catch (error) {
      if (error instanceof Error && error.message.includes("unavailable")) {
        throw error;
      }

      setProjectOptionsStatus("error");
      throw new Error("Unable to load project options.");
    }
  }

  async function ensureSupervisorOptions() {
    if (supervisorOptionsStatus === "ready" || supervisorOptionsStatus === "loading") {
      return;
    }

    setSupervisorOptionsStatus("loading");

    try {
      const result = await loadSupervisorOptionsAction();

      if (result.forbidden) {
        setSupervisorOptions([]);
        setSupervisorOptionsStatus("unavailable");
        throw new Error("Supervisor options are unavailable for the current viewer.");
      }

      setSupervisorOptions(result.people);
      setSupervisorOptionsStatus("ready");
    } catch (error) {
      if (error instanceof Error && error.message.includes("unavailable")) {
        throw error;
      }

      setSupervisorOptionsStatus("error");
      throw new Error("Unable to load supervisor options.");
    }
  }

  return (
    <div className="people-list-scroll">
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
            <PeopleListRow
              ensureProjectOptions={ensureProjectOptions}
              ensureSupervisorOptions={ensureSupervisorOptions}
              key={person.id}
              officeOptions={officeOptions}
              onAddProjectAction={onAddProjectAction}
              onUpdatePersonAction={onUpdatePersonAction}
              person={person}
              projectOptions={projectOptions}
              rowIndex={index}
              supervisorOptions={supervisorOptions}
            />
          ))
        )}
      </div>
    </div>
  );
}
