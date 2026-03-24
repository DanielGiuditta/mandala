import Link from "next/link";

import type {
  CreateProjectInput,
  ProjectDetailData,
  ProjectListItem,
} from "@mandala/db";
import type {
  ProjectDetailActionResult,
} from "../../projects/[projectId]/project-detail-actions";
import {
  addResourceAction,
  addStaffAction,
  addTaskAction,
  editWorklogAction,
  updateTaskAction,
} from "../../projects/[projectId]/project-detail-actions";

import { ProjectDetailGlance } from "./project-detail-glance";
import { ProjectDetailRail } from "./project-detail-rail";
import { ProjectCreateModal } from "./project-create-modal";
import type {
  ProjectCreateLeadOption,
  ProjectCreateOfficeOption,
} from "./project-create-types";
import { ProjectResourcesCard } from "./project-resources-card";
import { ProjectStaffCard } from "./project-staff-card";
import { ProjectTasksCard } from "./project-tasks-card";
import { ProjectPhoto } from "./project-detail-utils";
import { ProjectWorklogCard } from "./project-worklog-card";
import { EntityHeader } from "../entity-header";

interface ProjectDetailShellProps {
  createProjectAction: (
    input: CreateProjectInput,
  ) => Promise<{ projectId: string }>;
  data: ProjectDetailData;
  leadOptions: ProjectCreateLeadOption[];
  leadOptionsUnavailable: boolean;
  officeOptions: ProjectCreateOfficeOption[];
  peopleOptions: Array<{ fullName: string; id: string }>;
  projectId: string;
  railProjects: ProjectListItem[];
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

export function ProjectDetailShell({
  createProjectAction,
  data,
  leadOptions,
  leadOptionsUnavailable,
  officeOptions,
  peopleOptions,
  projectId,
  railProjects,
}: ProjectDetailShellProps) {
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

  if (data.forbidden) {
    const message =
      data.accessMessage ??
      "This viewer does not have access to the requested project.";

    return (
      <main className="pd-page">
        <section className="pd-card">
          <div className="pd-card-header">
            <h2 className="pd-card-title">Project access</h2>
          </div>
          <p className="pd-empty">{message}</p>
          {data.viewerLabel ? <p className="pd-meta-text">Viewer: {data.viewerLabel}</p> : null}
          {!data.configured && data.configMessage ? (
            <p className="pd-meta-text">{data.configMessage}</p>
          ) : null}
        </section>
      </main>
    );
  }

  if (!data.project) {
    return (
      <main className="pd-page">
        <section className="pd-card">
          <h2 className="pd-card-title">Project detail</h2>
          <p className="pd-empty">Configure the database connection to load live project data.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="pd-page">
      <div className="pd-layout">
        <ProjectDetailRail
          activeProjectId={projectId}
          configured={data.configured}
          createProjectTrigger={
            <ProjectCreateModal
              leadOptions={leadOptions}
              leadOptionsUnavailable={leadOptionsUnavailable}
              officeOptions={officeOptions}
              onCreateProjectAction={createProjectAction}
            />
          }
          forbidden={data.forbidden}
          projects={railProjects}
        />
        <section className="pd-entity">
          <EntityHeader
            action={
              <Link aria-label="Close and return to projects" className="entity-header-close-button" href="/projects">
                <img
                  alt=""
                  aria-hidden
                  className="entity-header-close-icon"
                  src="/figma/nav/close-icon.svg"
                />
              </Link>
            }
            className="pd-entity-header"
            media={<ProjectPhoto name={data.project.name} photoUrl={data.project.photoUrl} projectId={data.project.id} />}
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
                    peopleOptions={peopleOptions}
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
                    peopleOptions={peopleOptions}
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

            {!data.configured && data.configMessage ? <div className="notice pd-notice">{data.configMessage}</div> : null}
            {data.accessMessage ? <div className="notice pd-notice">{data.accessMessage}</div> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
