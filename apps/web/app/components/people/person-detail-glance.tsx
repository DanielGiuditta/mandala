"use client";

import { type ReactNode, useMemo, useState } from "react";

import type {
  CreatePersonPermission,
  PersonDetailData,
  UpdatePersonInput,
} from "@mandala/db";

import { EditableEntityPill } from "../editable-entity-pill";
import { EntityReturnLink } from "../entity-return-link";
import { buildPersonUpdateInput } from "./person-inline-edit-utils";
import {
  assertPersonMutationSucceeded,
  type PersonMutationActionResult,
} from "./person-action-results";
import { personPickToSelectOption } from "./person-pick-select-option";
import { PersonSourcedProjects } from "./person-sourced-projects";
import type {
  PersonCreateOfficeOption,
  PersonCreateSupervisorOption,
} from "./person-create-types";
import {
  formatCreatePersonPermissionLabel,
  PERSON_CREATE_PERMISSION_OPTIONS,
} from "./person-create-utils";
import { Avatar, formatHoursWithUnit, formatInrMetric } from "./person-detail-utils";

interface PersonDetailGlanceProps {
  loadProjectOptionsAction: () => Promise<{
    forbidden: boolean;
    projects: Array<{ id: string; name: string; photoUrl: string | null }>;
  }>;
  loadSupervisorOptionsAction: () => Promise<{
    forbidden: boolean;
    people: PersonCreateSupervisorOption[];
  }>;
  onAddProjectAction: (
    input: { personId: string; projectId: string },
  ) => Promise<{ error: string | null; ok: boolean }>;
  officeOptions: PersonCreateOfficeOption[];
  onUpdatePersonAction: (
    input: UpdatePersonInput,
  ) => Promise<PersonMutationActionResult>;
  person: NonNullable<PersonDetailData["person"]>;
}

export function PersonDetailGlance({
  loadProjectOptionsAction,
  loadSupervisorOptionsAction,
  onAddProjectAction,
  officeOptions,
  onUpdatePersonAction,
  person,
}: PersonDetailGlanceProps) {
  const hoursThisWeek = person.hoursThisWeek;
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

  const officeSelectOptions = useMemo(
    () => officeOptions.map((office) => ({ label: office.name, value: office.id })),
    [officeOptions],
  );
  const permissionOptions = useMemo(
    () =>
      PERSON_CREATE_PERMISSION_OPTIONS.map((permission) => ({
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
      })),
    [person.isCurrentViewer],
  );
  const projectSelectOptions = useMemo(
    () =>
      projectOptions.map((project) => ({
        label: project.name,
        leadingVisual: (
          <Avatar
            fallbackKey={project.id}
            label={project.name}
            photoUrl={project.photoUrl}
            variant="project"
          />
        ),
        value: project.id,
      })),
    [projectOptions],
  );

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

  function renderValueChip(label: string, toggleButton: ReactNode | null) {
    return (
      <span className="pd-value-chip">
        <strong>{label}</strong>
        {toggleButton}
      </span>
    );
  }

  function renderSupervisorChip(toggleButton: ReactNode | null) {
    if (!person.supervisorPersonId || !person.supervisorName) {
      return renderValueChip(
        toggleButton ? "Add Supervisor" : "No supervisor assigned",
        toggleButton,
      );
    }

    const supervisorContent = (
      <>
        <Avatar
          fallbackKey={person.supervisorPersonId ?? person.id}
          label={person.supervisorName ?? "No supervisor"}
          photoUrl={person.supervisorPhotoUrl}
          variant="person"
        />
        <strong className="entity-content-link-label">
          {person.supervisorName ?? "No supervisor assigned"}
        </strong>
      </>
    );

    return (
      <span className="pd-person-chip">
        {person.supervisorPersonId ? (
          <EntityReturnLink
            className="entity-content-link entity-content-link-grow"
            href={`/people/${person.supervisorPersonId}`}
            scope="people"
          >
            {supervisorContent}
          </EntityReturnLink>
        ) : (
          supervisorContent
        )}
        {toggleButton}
      </span>
    );
  }

  return (
    <section className="pd-glance-card">
      <h3 className="pd-card-title">At a glance</h3>
      <div className="pd-glance-grid pd-glance-grid-person">
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Sourced to</span>
          {person.staffedProjects.length > 0 ? (
            <PersonSourcedProjects
              personName={person.fullName}
              projects={person.staffedProjects}
              variant="detail"
            />
          ) : person.canEdit ? (
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
              renderTrigger={({ toggleButton }) =>
                renderValueChip("Add Project", toggleButton)
              }
            />
          ) : (
            <strong>No tracked projects</strong>
          )}
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Office</span>
          {person.canEdit ? (
            <EditableEntityPill
              ariaLabel={`Change office for ${person.fullName}`}
              onCommit={async (nextValue) => {
                assertPersonMutationSucceeded(
                  await onUpdatePersonAction(
                    buildPersonUpdateInput(person, {
                      officeId: nextValue,
                    }),
                  ),
                  "Unable to update person.",
                );
              }}
              options={officeSelectOptions}
              value={person.officeId}
              renderTrigger={({ toggleButton }) =>
                renderValueChip(person.officeName || "Add Office", toggleButton)
              }
            />
          ) : (
            renderValueChip(person.officeName || "No office assigned", null)
          )}
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Supervisor</span>
          {person.canEdit ? (
            <EditableEntityPill
              ariaLabel={`Change supervisor for ${person.fullName}`}
              onCommit={async (nextValue) => {
                assertPersonMutationSucceeded(
                  await onUpdatePersonAction(
                    buildPersonUpdateInput(person, {
                      supervisorPersonId: nextValue || null,
                    }),
                  ),
                  "Unable to update person.",
                );
              }}
              onOpenRequested={ensureSupervisorOptions}
              options={[
                { label: "No supervisor", value: "" },
                ...supervisorOptions.map((supervisor) => personPickToSelectOption(supervisor)),
              ]}
              value={person.supervisorPersonId ?? ""}
              renderTrigger={({ toggleButton }) => renderSupervisorChip(toggleButton)}
            />
          ) : (
            renderSupervisorChip(null)
          )}
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Hours this week</span>
          <strong>{formatHoursWithUnit(hoursThisWeek)}</strong>
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Permission</span>
          {person.canEditPermission ? (
            <EditableEntityPill
              ariaLabel={`Change permission for ${person.fullName}`}
              onCommit={async (nextValue) => {
                assertPersonMutationSucceeded(
                  await onUpdatePersonAction(
                    buildPersonUpdateInput(person, {
                      permission: nextValue as CreatePersonPermission,
                    }),
                  ),
                  "Unable to update person.",
                );
              }}
              options={permissionOptions}
              value={person.effectivePermission}
              renderTrigger={({ toggleButton }) =>
                renderValueChip(
                  formatCreatePersonPermissionLabel(person.effectivePermission),
                  toggleButton,
                )
              }
            />
          ) : (
            renderValueChip(
              formatCreatePersonPermissionLabel(person.effectivePermission),
              null,
            )
          )}
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Role</span>
          <strong>{person.title ?? "Not set"}</strong>
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Salary</span>
          <strong>{formatInrMetric(person.annualSalary)}</strong>
        </div>
      </div>
    </section>
  );
}
