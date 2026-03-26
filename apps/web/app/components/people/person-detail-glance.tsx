"use client";

import { type ReactNode, useMemo, useState } from "react";

import type {
  CreatePersonPermission,
  PersonDetailData,
  UpdatePersonInput,
} from "@mandala/db";

import { EditableEntityPill } from "../editable-entity-pill";
import { buildPersonUpdateInput } from "./person-inline-edit-utils";
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
  loadSupervisorOptionsAction: () => Promise<{
    forbidden: boolean;
    people: PersonCreateSupervisorOption[];
  }>;
  officeOptions: PersonCreateOfficeOption[];
  onUpdatePersonAction: (
    input: UpdatePersonInput,
  ) => Promise<{ personId: string }>;
  person: NonNullable<PersonDetailData["person"]>;
}

export function PersonDetailGlance({
  loadSupervisorOptionsAction,
  officeOptions,
  onUpdatePersonAction,
  person,
}: PersonDetailGlanceProps) {
  const sourcedProject = person.staffedProjects[0] ?? null;
  const additionalProjectCount = Math.max(
    0,
    person.staffedProjects.length - (sourcedProject ? 1 : 0),
  );
  const hoursThisWeek = person.hoursThisWeek;
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

  return (
    <section className="pd-glance-card">
      <h3 className="pd-card-title">At a glance</h3>
      <div className="pd-glance-grid pd-glance-grid-person">
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Sourced to</span>
          {sourcedProject ? (
            <strong title={sourcedProject.projectName}>
              {sourcedProject.projectName}
              {additionalProjectCount > 0 ? ` +${additionalProjectCount}` : ""}
            </strong>
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
                await onUpdatePersonAction(
                  buildPersonUpdateInput(person, {
                    officeId: nextValue,
                  }),
                );
              }}
              options={officeSelectOptions}
              value={person.officeId}
              renderTrigger={({ toggleButton }) =>
                renderValueChip(person.officeName, toggleButton)
              }
            />
          ) : (
            renderValueChip(person.officeName, null)
          )}
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Supervisor</span>
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
              options={[
                { label: "No supervisor", value: "" },
                ...supervisorOptions.map((supervisor) => ({
                  label: supervisor.fullName,
                  value: supervisor.id,
                })),
              ]}
              value={person.supervisorPersonId ?? ""}
              renderTrigger={({ toggleButton }) => (
                <span className="pd-person-chip">
                  <Avatar
                    fallbackKey={person.supervisorPersonId ?? person.id}
                    label={person.supervisorName ?? "No supervisor"}
                    photoUrl={person.supervisorPhotoUrl}
                    variant="person"
                  />
                  <strong>{person.supervisorName ?? "No supervisor assigned"}</strong>
                  {toggleButton}
                </span>
              )}
            />
          ) : (
            <span className="pd-person-chip">
              <Avatar
                fallbackKey={person.supervisorPersonId ?? person.id}
                label={person.supervisorName ?? "No supervisor"}
                photoUrl={person.supervisorPhotoUrl}
                variant="person"
              />
              <strong>{person.supervisorName ?? "No supervisor assigned"}</strong>
            </span>
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
                await onUpdatePersonAction(
                  buildPersonUpdateInput(person, {
                    permission: nextValue as CreatePersonPermission,
                  }),
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
