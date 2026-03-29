"use client";

import { type ReactNode, useMemo, useState } from "react";

import type { PeopleOptionRow, ProjectListItem, ProjectTimeSummary, UpdateProjectInput } from "@mandala/db";

import { personPickToSelectOption } from "../people/person-pick-select-option";
import { EditableEntityPill } from "../editable-entity-pill";
import { EntityReturnLink } from "../entity-return-link";
import type { ProjectCreateOfficeOption } from "./project-create-types";
import { PROJECT_CREATE_STAGE_OPTIONS } from "./project-create-utils";
import { projectStageToSelectOption } from "./project-stage-select-option";
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
    people: PeopleOptionRow[];
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
  const [leadOptions, setLeadOptions] = useState<PeopleOptionRow[]>([]);
  const [leadOptionsStatus, setLeadOptionsStatus] = useState<
    "idle" | "loading" | "ready" | "unavailable" | "error"
  >("idle");

  const stageOptions = useMemo(
    () => PROJECT_CREATE_STAGE_OPTIONS.map((stage) => projectStageToSelectOption(stage)),
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

  function renderLeadChip(toggleButton: ReactNode | null) {
    if (!project.leadPersonId || !project.leadPersonName) {
      return renderValueChip(
        toggleButton ? "Add Lead" : "No lead assigned",
        toggleButton,
      );
    }

    const leadContent = (
      <>
        <Avatar
          fallbackKey={project.leadPersonId ?? project.id}
          label={project.leadPersonName ?? "Lead"}
          photoUrl={project.leadPersonPhotoUrl}
        />
        <strong className="entity-content-link-label">
          {project.leadPersonName ?? "No lead assigned"}
        </strong>
      </>
    );

    return (
      <span className="pd-person-chip">
        {project.leadPersonId ? (
          <EntityReturnLink
            className="entity-content-link entity-content-link-grow"
            href={`/people/${project.leadPersonId}`}
            scope="people"
          >
            {leadContent}
          </EntityReturnLink>
        ) : (
          leadContent
        )}
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
              ariaLabel={`Change office for ${project.name}`}
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
                renderValueChip(project.managingOfficeName || "Add Office", toggleButton)
              }
            />
          ) : (
            renderValueChip(project.managingOfficeName || "No office assigned", null)
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
                ...leadOptions.map((person) => personPickToSelectOption(person)),
              ]}
              value={project.leadPersonId ?? ""}
              renderTrigger={({ toggleButton }) => renderLeadChip(toggleButton)}
            />
          ) : (
            renderLeadChip(null)
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
    </section>
  );
}
