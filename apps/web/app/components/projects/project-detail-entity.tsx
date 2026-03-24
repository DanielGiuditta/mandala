import type { ProjectDetailData } from "@mandala/db";
import type { ProjectDetailActionResult } from "../../projects/[projectId]/project-detail-actions";
import {
  addResourceAction,
  addStaffAction,
  addTaskAction,
  editWorklogAction,
  updateTaskAction,
} from "../../projects/[projectId]/project-detail-actions";

import { EntityHeader } from "../entity-header";
import { ProjectDetailCloseButton } from "./project-detail-close-button";
import { ProjectDetailGlance } from "./project-detail-glance";
import { ProjectPhoto } from "./project-detail-utils";
import { ProjectResourcesCard } from "./project-resources-card";
import { ProjectStaffCard } from "./project-staff-card";
import { ProjectTasksCard } from "./project-tasks-card";
import { ProjectWorklogCard } from "./project-worklog-card";

interface ProjectDetailEntityProps {
  data: ProjectDetailData;
  loadPeopleOptionsAction: () => Promise<{
    forbidden: boolean;
    people: Array<{ fullName: string; id: string }>;
  }>;
  projectId: string;
}

type AddStaffAction = (
  input: {
    assignedHoursPerWeek: number;
    endDate?: string | null;
    notes?: string | null;
    personId: string;
    projectId: string;
    startDate?: string | null;
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
  data,
  loadPeopleOptionsAction,
  projectId,
}: ProjectDetailEntityProps) {
  const taskActions: {
    addTaskAction: AddTaskAction;
    updateTaskAction: UpdateTaskAction;
  } = {
    addTaskAction,
    updateTaskAction,
  };
  const staffActions: {
    addStaffAction: AddStaffAction;
  } = {
    addStaffAction,
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
        action={<ProjectDetailCloseButton />}
        className="pd-entity-header"
        media={
          <ProjectPhoto
            name={data.project.name}
            photoUrl={data.project.photoUrl}
            projectId={data.project.id}
          />
        }
        title={data.project.name}
      />
      <div className="pd-entity-content">
        <ProjectDetailGlance project={data.project} timeSummary={data.timeSummary} />

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
                addStaffAction={staffActions.addStaffAction}
                loadPeopleOptionsAction={loadPeopleOptionsAction}
                projectId={projectId}
                staffing={data.staffing}
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
