import type { PersonListItem, UpdatePersonInput } from "@mandala/db";
import type { ReactNode } from "react";

import { EditableEntityPill } from "../editable-entity-pill";
import { EntityPersonPill } from "../entity-person-pill";
import { EntityReturnLink } from "../entity-return-link";
import {
  getFallbackAvatarInitial,
  getPersonFallbackAvatarStyle,
  getProjectFallbackAvatarStyle,
} from "../projects/project-avatar-utils";
import { buildPersonUpdateInput } from "./person-inline-edit-utils";
import { personPickToSelectOption } from "./person-pick-select-option";
import type {
  PersonCreateOfficeOption,
  PersonCreateSupervisorOption,
} from "./person-create-types";
import {
  formatAnnualSalaryCompact,
  formatHoursThisWeek,
  getPersonInitials,
} from "./people-list-formatters";
import {
  formatCreatePersonPermissionLabel,
  PERSON_CREATE_PERMISSION_OPTIONS,
} from "./person-create-utils";

interface PeopleListRowProps {
  ensureProjectOptions: () => Promise<void>;
  ensureSupervisorOptions: () => Promise<void>;
  officeOptions: PersonCreateOfficeOption[];
  onAddProjectAction: (
    input: { personId: string; projectId: string },
  ) => Promise<{ error: string | null; ok: boolean }>;
  onUpdatePersonAction: (
    input: UpdatePersonInput,
  ) => Promise<{ personId: string }>;
  person: PersonListItem;
  projectOptions: Array<{ id: string; name: string; photoUrl: string | null }>;
  rowIndex: number;
  supervisorOptions: PersonCreateSupervisorOption[];
}

export function PeopleListRow({
  ensureProjectOptions,
  ensureSupervisorOptions,
  officeOptions,
  onAddProjectAction,
  onUpdatePersonAction,
  person,
  projectOptions,
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
    ...supervisorOptions.map((supervisor) => personPickToSelectOption(supervisor)),
  ];
  const projectSelectOptions = projectOptions.map((project) => ({
    label: project.name,
    leadingVisual: project.photoUrl ? (
      <img
        alt=""
        aria-hidden
        className="people-project-chip-avatar"
        loading="lazy"
        src={project.photoUrl}
      />
    ) : (
      <span
        aria-hidden
        className="people-project-chip-fallback"
        style={getProjectFallbackAvatarStyle(project.name, project.id)}
      >
        {getFallbackAvatarInitial(project.name)}
      </span>
    ),
    value: project.id,
  }));
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
    if (!person.supervisorName) {
      return (
        <EntityPersonPill
          actionLabel="Add Supervisor"
          readonlyLabel="No supervisor"
          toggleButton={toggleButton}
          variant="empty"
        />
      );
    }

    return (
      <EntityPersonPill
        avatarFallbackKey={person.supervisorPersonId ?? person.id}
        displayName={person.supervisorName}
        personId={person.supervisorPersonId ?? null}
        photoUrl={person.supervisorPhotoUrl}
        toggleButton={toggleButton}
        variant="person"
      />
    );
  }

  function renderProjectPickerPill() {
    return (
      <EditableEntityPill
        ariaLabel={`Add project for ${person.fullName}`}
        emptyStateLabel="No projects available."
        onCommit={async (nextValue) => {
          const result = await onAddProjectAction({
            personId: person.id,
            projectId: nextValue,
          });

          if (!result.ok) {
            throw new Error(result.error ?? "Unable to add project.");
          }
        }}
        onOpenRequested={ensureProjectOptions}
        options={projectSelectOptions}
        value=""
        renderTrigger={({ toggleButton }) => (
          <span className="people-value-pill">
            <span className="people-cell-value">Add Project</span>
            {toggleButton}
          </span>
        )}
      />
    );
  }

  function renderStaffedProjectChip(project: PersonListItem["staffedProjects"][number]) {
    return (
      <EntityReturnLink
        className="people-project-chip entity-content-link"
        href={`/projects/${project.projectId}`}
        key={project.projectId}
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

  return (
    <article
      className={`people-list-row ${rowIndex % 2 === 0 ? "people-list-row-light" : "people-list-row-base"}`}
    >
      <div className="people-cell people-cell-name">
        <EntityReturnLink
          className="entity-content-link entity-content-link-grow"
          href={`/people/${person.id}`}
          scope="people"
        >
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
          <span className="people-name-link entity-content-link-label">
            {person.fullName}
          </span>
        </EntityReturnLink>
      </div>

      <div className="people-cell">
        {person.staffedProjects.length > 0 ? (
          <div
            className="people-project-chips"
            title={person.staffedProjects.map((project) => project.projectName).join(", ")}
          >
            {visibleStaffedProjects.map((project) => renderStaffedProjectChip(project))}
            {remainingStaffedProjects > 0 ? (
              <span className="people-project-overflow">+{remainingStaffedProjects}</span>
            ) : null}
          </div>
        ) : person.canEdit ? (
          renderProjectPickerPill()
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
            renderTrigger={({ toggleButton }) => (
              <span className="people-value-pill">
                <span className="people-cell-value">
                  {person.officeName || "Add Office"}
                </span>
                {toggleButton}
              </span>
            )}
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
            renderTrigger={({ toggleButton }) => (
              <span className="people-value-pill">
                <span className="people-cell-value">
                  {formatCreatePersonPermissionLabel(person.effectivePermission)}
                </span>
                {toggleButton}
              </span>
            )}
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
