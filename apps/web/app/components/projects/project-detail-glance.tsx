"use client";

import { type ReactNode, useMemo, useState } from "react";

import type { ProjectListItem, ProjectTimeSummary, UpdateProjectInput } from "@mandala/db";

import { EditableEntityPill } from "../editable-entity-pill";
import type { ProjectCreateOfficeOption } from "./project-create-types";
import {
  formatProjectStageLabel,
  PROJECT_CREATE_STAGE_OPTIONS,
} from "./project-create-utils";
import {
  Avatar,
  formatCostMetric,
  formatHoursMetric,
  formatShortDate,
  formatStageLabel,
} from "./project-detail-utils";
import { buildProjectUpdateInput } from "./project-inline-edit-utils";
import { stageIcon } from "./projects-formatters";

interface ProjectDetailGlanceProps {
  loadPeopleOptionsAction: () => Promise<{
    forbidden: boolean;
    people: Array<{ fullName: string; id: string }>;
  }>;
  officeOptions: ProjectCreateOfficeOption[];
  onUpdateProjectAction: (
    input: UpdateProjectInput,
  ) => Promise<{ projectId: string }>;
  project: ProjectListItem;
  timeSummary: ProjectTimeSummary;
}

export function ProjectDetailGlance({
  loadPeopleOptionsAction,
  officeOptions,
  onUpdateProjectAction,
  project,
  timeSummary,
}: ProjectDetailGlanceProps) {
  const [leadOptions, setLeadOptions] = useState<Array<{ fullName: string; id: string }>>([]);
  const [leadOptionsStatus, setLeadOptionsStatus] = useState<
    "idle" | "loading" | "ready" | "unavailable" | "error"
  >("idle");

  const stageOptions = useMemo(
    () =>
      PROJECT_CREATE_STAGE_OPTIONS.map((stage) => ({
        label: formatProjectStageLabel(stage),
        value: stage,
      })),
    [],
  );
  const officeSelectOptions = useMemo(
    () => officeOptions.map((office) => ({ label: office.name, value: office.id })),
    [officeOptions],
  );

  async function ensureLeadOptions() {
    if (leadOptionsStatus === "ready" || leadOptionsStatus === "loading") {
      return;
    }

    setLeadOptionsStatus("loading");

    try {
      const result = await loadPeopleOptionsAction();

      if (result.forbidden) {
        setLeadOptions([]);
        setLeadOptionsStatus("unavailable");
        throw new Error("Lead options are unavailable for the current viewer.");
      }

      setLeadOptions(result.people);
      setLeadOptionsStatus("ready");
    } catch (error) {
      if (error instanceof Error && error.message.includes("unavailable")) {
        throw error;
      }

      setLeadOptionsStatus("error");
      throw new Error("Unable to load lead options.");
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
      <div className="pd-glance-grid">
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Due</span>
          <strong>{formatShortDate(project.targetCompletionDate)}</strong>
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Client</span>
          <strong>{project.clientName ?? "Unassigned"}</strong>
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Office</span>
          {project.canEditProject ? (
            <EditableEntityPill
              ariaLabel={`Change managing office for ${project.name}`}
              onCommit={async (nextValue) => {
                await onUpdateProjectAction(
                  buildProjectUpdateInput(project, {
                    managingOfficeId: nextValue,
                  }),
                );
              }}
              options={officeSelectOptions}
              value={project.managingOfficeId}
              renderTrigger={({ toggleButton }) =>
                renderValueChip(project.managingOfficeName, toggleButton)
              }
            />
          ) : (
            renderValueChip(project.managingOfficeName, null)
          )}
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Lead</span>
          {project.canEditProject ? (
            <EditableEntityPill
              ariaLabel={`Change lead for ${project.name}`}
              onCommit={async (nextValue) => {
                await onUpdateProjectAction(
                  buildProjectUpdateInput(project, {
                    leadPersonId: nextValue || null,
                  }),
                );
              }}
              onOpenRequested={ensureLeadOptions}
              options={[
                { label: "No lead", value: "" },
                ...leadOptions.map((person) => ({
                  label: person.fullName,
                  value: person.id,
                })),
              ]}
              value={project.leadPersonId ?? ""}
              renderTrigger={({ toggleButton }) => (
                <span className="pd-person-chip">
                  <Avatar
                    fallbackKey={project.leadPersonId ?? project.id}
                    label={project.leadPersonName ?? "Lead"}
                    photoUrl={project.leadPersonPhotoUrl}
                  />
                  <strong>{project.leadPersonName ?? "No lead assigned"}</strong>
                  {toggleButton}
                </span>
              )}
            />
          ) : (
            <span className="pd-person-chip">
              <Avatar
                fallbackKey={project.leadPersonId ?? project.id}
                label={project.leadPersonName ?? "Lead"}
                photoUrl={project.leadPersonPhotoUrl}
              />
              <strong>{project.leadPersonName ?? "No lead assigned"}</strong>
            </span>
          )}
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Stage</span>
          {project.canEditStage ? (
            <EditableEntityPill
              ariaLabel={`Change stage for ${project.name}`}
              onCommit={async (nextValue) => {
                await onUpdateProjectAction(
                  buildProjectUpdateInput(project, {
                    stage: nextValue as ProjectListItem["stage"],
                  }),
                );
              }}
              options={stageOptions}
              value={project.stage}
              renderTrigger={({ toggleButton }) => (
                <span className="pd-value-chip">
                  <span aria-hidden className="projects-inline-icon">
                    {stageIcon(project.stage)}
                  </span>
                  <strong>{formatStageLabel(project.stage)}</strong>
                  {toggleButton}
                </span>
              )}
            />
          ) : (
            <span className="pd-value-chip">
              <span aria-hidden className="projects-inline-icon">
                {stageIcon(project.stage)}
              </span>
              <strong>{formatStageLabel(project.stage)}</strong>
            </span>
          )}
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Hours</span>
          <strong>{formatHoursMetric(timeSummary.totalHours)}</strong>
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Cost</span>
          <strong>{formatCostMetric(timeSummary.totalLaborCost)}</strong>
        </div>
      </div>
      <div className="pd-glance-footnote pd-glance-footnote-inline">
        <span>Originating office:</span>
        {project.canEditProject ? (
          <EditableEntityPill
            ariaLabel={`Change originating office for ${project.name}`}
            onCommit={async (nextValue) => {
              await onUpdateProjectAction(
                buildProjectUpdateInput(project, {
                  originatingOfficeId: nextValue,
                }),
              );
            }}
            options={officeSelectOptions}
            value={project.originatingOfficeId}
            renderTrigger={({ toggleButton }) =>
              renderValueChip(project.originatingOfficeName, toggleButton)
            }
          />
        ) : (
          renderValueChip(project.originatingOfficeName, null)
        )}
      </div>
    </section>
  );
}
