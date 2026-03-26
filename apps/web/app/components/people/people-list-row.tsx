import type { PersonListItem, UpdatePersonInput } from "@mandala/db";
import type { ReactNode } from "react";

import { EditableEntityPill } from "../editable-entity-pill";
import { EntityReturnLink } from "../entity-return-link";
import {
  getFallbackAvatarInitial,
  getPersonFallbackAvatarStyle,
  getProjectFallbackAvatarStyle,
} from "../projects/project-avatar-utils";
import { buildPersonUpdateInput } from "./person-inline-edit-utils";
import type {
  PersonCreateOfficeOption,
  PersonCreateSupervisorOption,
} from "./person-create-types";
import {
  formatAnnualSalaryCompact,
  formatHoursThisWeek,
  getInitialsFromName,
  getPersonInitials,
} from "./people-list-formatters";
import {
  formatCreatePersonPermissionLabel,
  PERSON_CREATE_PERMISSION_OPTIONS,
} from "./person-create-utils";

interface PeopleListRowProps {
  ensureSupervisorOptions: () => Promise<void>;
  officeOptions: PersonCreateOfficeOption[];
  onUpdatePersonAction: (
    input: UpdatePersonInput,
  ) => Promise<{ personId: string }>;
  person: PersonListItem;
  rowIndex: number;
  supervisorOptions: PersonCreateSupervisorOption[];
}

export function PeopleListRow({
  ensureSupervisorOptions,
  officeOptions,
  onUpdatePersonAction,
  person,
  rowIndex,
  supervisorOptions,
}: PeopleListRowProps) {
  const visibleStaffedProjects = person.staffedProjects.slice(0, 2);
  const remainingStaffedProjects = Math.max(
    0,
    person.staffedProjects.length - visibleStaffedProjects.length,
  );
  const officeSelectOptions = officeOptions.map((office) => ({
    label: office.name,
    value: office.id,
  }));
  const supervisorSelectOptions = [
    { label: "No supervisor", value: "" },
    ...supervisorOptions.map((supervisor) => ({
      label: supervisor.fullName,
      value: supervisor.id,
    })),
  ];
  const permissionSelectOptions = PERSON_CREATE_PERMISSION_OPTIONS.map((permission) => ({
    description:
      person.isCurrentViewer &&
      (permission.value === "employee" || permission.value === "noAccount")
        ? "Another partner or admin must make this change."
        : undefined,
    disabled:
      person.isCurrentViewer &&
      (permission.value === "employee" || permission.value === "noAccount"),
    label: permission.label,
    value: permission.value,
  }));

  function renderSupervisorPill(toggleButton: ReactNode | null) {
    return (
      <span className="people-reference-pill">
        {person.supervisorName ? (
          person.supervisorPhotoUrl ? (
            <img
              alt=""
              aria-hidden
              className="people-reference-avatar"
              loading="lazy"
              src={person.supervisorPhotoUrl}
            />
          ) : (
            <span
              aria-hidden
              className="people-reference-fallback"
              style={getPersonFallbackAvatarStyle(
                person.supervisorName,
                person.supervisorPersonId ?? person.id,
              )}
            >
              {getInitialsFromName(person.supervisorName)}
            </span>
          )
        ) : (
          <span
            aria-hidden
            className="people-reference-fallback"
            style={getPersonFallbackAvatarStyle("No supervisor", person.id)}
          >
            {getFallbackAvatarInitial("No supervisor", "S")}
          </span>
        )}
        <span className="people-cell-value">
          {person.supervisorName ?? "No supervisor"}
        </span>
        {toggleButton}
      </span>
    );
  }

  function renderValuePill(label: string, toggleButton: ReactNode | null) {
    return (
      <span className="people-value-pill">
        <span className="people-cell-value">{label}</span>
        {toggleButton}
      </span>
    );
  }

  return (
    <article
      className={`people-list-row ${rowIndex % 2 === 0 ? "people-list-row-light" : "people-list-row-base"}`}
    >
      <div className="people-cell people-cell-name">
        {person.photoUrl ? (
          <img
            alt=""
            aria-hidden
            className="people-avatar-image"
            loading="lazy"
            src={person.photoUrl}
          />
        ) : (
          <span
            aria-hidden
            className="people-avatar-fallback"
            style={getPersonFallbackAvatarStyle(person.fullName, person.id)}
          >
            {getPersonInitials(person)}
          </span>
        )}
        <EntityReturnLink
          className="people-name-link"
          href={`/people/${person.id}`}
          scope="people"
        >
          {person.fullName}
        </EntityReturnLink>
      </div>

      <div className="people-cell">
        {person.staffedProjects.length > 0 ? (
          <div
            className="people-project-chips"
            title={person.staffedProjects.map((project) => project.projectName).join(", ")}
          >
            {visibleStaffedProjects.map((project) => (
              <span className="people-project-chip" key={project.projectId}>
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
                <span className="people-cell-value">{project.projectName}</span>
              </span>
            ))}
            {remainingStaffedProjects > 0 ? (
              <span className="people-project-overflow">+{remainingStaffedProjects}</span>
            ) : null}
          </div>
        ) : (
          <span className="people-reference-empty">No active projects</span>
        )}
      </div>

      <div className="people-cell">
        {person.canEdit ? (
          <EditableEntityPill
            ariaLabel={`Change office for ${person.fullName}`}
            onCommit={async (nextValue) => {
              await onUpdatePersonAction(
                buildPersonUpdateInput(person, {
                  officeId: nextValue,
                }),
              );
            }}
            options={officeSelectOptions}
            value={person.officeId}
            renderTrigger={({ toggleButton }) =>
              renderValuePill(person.officeName, toggleButton)
            }
          />
        ) : (
          <span className="people-cell-value">{person.officeName}</span>
        )}
      </div>

      <div className="people-cell">
        {person.canEdit ? (
          <EditableEntityPill
            ariaLabel={`Change supervisor for ${person.fullName}`}
            onCommit={async (nextValue) => {
              await onUpdatePersonAction(
                buildPersonUpdateInput(person, {
                  supervisorPersonId: nextValue || null,
                }),
              );
            }}
            onOpenRequested={ensureSupervisorOptions}
            options={supervisorSelectOptions}
            value={person.supervisorPersonId ?? ""}
            renderTrigger={({ toggleButton }) =>
              renderSupervisorPill(toggleButton)
            }
          />
        ) : person.supervisorName ? (
          renderSupervisorPill(null)
        ) : (
          <span className="people-reference-empty">No supervisor</span>
        )}
      </div>

      <div className="people-cell people-cell-metric">
        <span className="people-cell-value">{formatHoursThisWeek(person.hoursThisWeek)}</span>
      </div>

      <div className="people-cell">
        {person.canEditPermission ? (
          <EditableEntityPill
            ariaLabel={`Change permission for ${person.fullName}`}
            onCommit={async (nextValue) => {
              await onUpdatePersonAction(
                buildPersonUpdateInput(person, {
                  permission: nextValue as PersonListItem["effectivePermission"],
                }),
              );
            }}
            options={permissionSelectOptions}
            value={person.effectivePermission}
            renderTrigger={({ toggleButton }) =>
              renderValuePill(
                formatCreatePersonPermissionLabel(person.effectivePermission),
                toggleButton,
              )
            }
          />
        ) : (
          <span className="people-cell-value">
            {person.effectivePermissionLabel ?? "No account"}
          </span>
        )}
      </div>

      <div className="people-cell">
        <span className="people-cell-value">{person.title ?? "Not set"}</span>
      </div>

      <div className="people-cell people-cell-metric">
        <span className="people-cell-value">{formatAnnualSalaryCompact(person.annualSalary)}</span>
      </div>
    </article>
  );
}
