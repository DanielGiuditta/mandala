import type { ProjectDetailData, UpdateProjectInput } from "@mandala/db";
import type { ReactNode } from "react";
import type { ProjectDetailActionResult } from "../../projects/[projectId]/project-detail-actions";
import {
  addResourceAction,
  addTaskAction,
  editWorklogAction,
  quickAddStaffAction,
  updateTaskAction,
} from "../../projects/[projectId]/project-detail-actions";

import { EntityHeader } from "../entity-header";
import { ProjectDetailCloseButton } from "./project-detail-close-button";
import { ProjectCreateModal } from "./project-create-modal";
import { ProjectDetailGlance } from "./project-detail-glance";
import { EntityPhoto } from "./project-detail-utils";
import { ProjectResourcesCard } from "./project-resources-card";
import { ProjectStaffCard } from "./project-staff-card";
import { ProjectTasksCard } from "./project-tasks-card";
import { ProjectWorklogCard } from "./project-worklog-card";
import type { ProjectCreateOfficeOption } from "./project-create-types";

interface ProjectDetailEntityProps {
  closeControl?: ReactNode;
  data: ProjectDetailData;
  loadPeopleOptionsAction: () => Promise<{
    forbidden: boolean;
    people: Array<{ fullName: string; id: string }>;
  }>;
  officeOptions: ProjectCreateOfficeOption[];
  onUpdateProjectAction: (
    input: UpdateProjectInput,
  ) => Promise<{ projectId: string }>;
  projectId: string;
}

type AddStaffAction = (
  input: {
    personId: string;
    projectId: string;
  },
) => Promise<ProjectDetailActionResult>;

type AddTaskAction = (
  input: {
    assignedPersonId?: string | null;
    projectId: string;
    title: string;
  },
) => Promise<ProjectDetailActionResult>;

type UpdateTaskAction = (
  input: {
    assignedPersonId?: string | null;
    checklistItemId: string;
    completed?: boolean;
    projectId: string;
    title?: string;
  },
) => Promise<ProjectDetailActionResult>;

type AddResourceAction = (
  input: {
    category?: string | null;
    description?: string | null;
    fileType?: string | null;
    fileUrl: string;
    name: string;
    projectId: string;
  },
) => Promise<ProjectDetailActionResult>;

type EditWorklogAction = (
  input: {
    assignmentId?: string | null;
    date?: string;
    hours?: number;
    notes?: string | null;
    projectId: string;
    timeEntryId: string;
  },
) => Promise<ProjectDetailActionResult>;

export function ProjectDetailEntity({
  closeControl,
  data,
  loadPeopleOptionsAction,
  officeOptions,
  onUpdateProjectAction,
  projectId,
}: ProjectDetailEntityProps) {
  const taskActions: {
    addTaskAction: AddTaskAction;
    updateTaskAction: UpdateTaskAction;
  } = {
    addTaskAction,
    updateTaskAction,
  };
  const resourceActions: {
    addResourceAction: AddResourceAction;
  } = {
    addResourceAction,
  };
  const worklogActions: {
    editWorklogAction: EditWorklogAction;
  } = {
    editWorklogAction,
  };

  if (!data.project) {
    return (
      <section className="pd-card">
        <h2 className="pd-card-title">Project detail</h2>
        <p className="pd-empty">Configure the database connection to load live project data.</p>
      </section>
    );
  }

  return (
    <section className="pd-entity">
      <EntityHeader
        action={
          <div className="entity-header-action-group">
            <ProjectCreateModal
              disabled={!data.canEdit}
              disabledReason={!data.canEdit ? "Only admins and partners can edit this project." : undefined}
              initialFormInput={{
                clientName: data.project.clientName ?? "",
                description: data.project.description ?? "",
                leadPersonId: data.project.leadPersonId ?? "",
                name: data.project.name,
                officeId: data.project.managingOfficeId,
                photoFile: null,
                photoUrl: data.project.photoUrl ?? null,
                stage: data.project.stage,
                startDate: data.project.startDate ?? null,
                targetCompletionDate: data.project.targetCompletionDate ?? null,
              }}
              loadLeadOptionsAction={loadPeopleOptionsAction}
              mode="edit"
              officeOptions={officeOptions}
              onUpdateProjectAction={onUpdateProjectAction}
              preservedOriginatingOfficeId={
                data.project.originatingOfficeId !== data.project.managingOfficeId
                  ? data.project.originatingOfficeId
                  : undefined
              }
              projectId={data.project.id}
              trigger="edit"
            />
            {closeControl ?? <ProjectDetailCloseButton />}
          </div>
        }
        className="pd-entity-header"
        media={
          <EntityPhoto
            entityId={data.project.id}
            label={data.project.name}
            photoUrl={data.project.photoUrl}
            variant="project"
          />
        }
        title={data.project.name}
      />
      <div className="pd-entity-content">
        <ProjectDetailGlance
          loadPeopleOptionsAction={loadPeopleOptionsAction}
          officeOptions={officeOptions}
          onUpdateProjectAction={onUpdateProjectAction}
          project={data.project}
          timeSummary={data.timeSummary}
        />

        {data.restrictedToSummary ? (
          <section className="pd-card">
            <p className="pd-empty">
              Internal task, staffing, resource, and worklog details are hidden for this viewer.
            </p>
            <p className="pd-meta-text">
              Managing office: {data.project.managingOfficeName}. Originating office:{" "}
              {data.project.originatingOfficeName}.
            </p>
          </section>
        ) : (
          <div className="pd-columns">
            <div className="pd-col-main">
              <ProjectTasksCard
                addTaskAction={taskActions.addTaskAction}
                canEditChecklistItems={data.canEditChecklistItems}
                checklistItems={data.checklistItems}
                loadPeopleOptionsAction={loadPeopleOptionsAction}
                projectId={projectId}
                updateTaskAction={taskActions.updateTaskAction}
              />
              <ProjectWorklogCard
                editWorklogAction={worklogActions.editWorklogAction}
                projectId={projectId}
                staffing={data.staffing}
                timeSummary={data.timeSummary}
              />
            </div>
            <div className="pd-col-side">
              <ProjectStaffCard
                addStaffAction={quickAddStaffAction}
                canAssignPeople={data.canAssignPeople}
                loadPeopleOptionsAction={loadPeopleOptionsAction}
                projectId={projectId}
                staffedPeople={data.staffedPeople}
              />
              <ProjectResourcesCard
                addResourceAction={resourceActions.addResourceAction}
                documents={data.documents}
                projectId={projectId}
              />
            </div>
          </div>
        )}

        {!data.configured && data.configMessage ? (
          <div className="notice pd-notice">{data.configMessage}</div>
        ) : null}
        {data.accessMessage ? <div className="notice pd-notice">{data.accessMessage}</div> : null}
      </div>
    </section>
  );
}
