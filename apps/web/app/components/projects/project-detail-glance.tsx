import type { ProjectListItem, ProjectTimeSummary } from "@mandala/db";

import {
  Avatar,
  formatCostMetric,
  formatHoursMetric,
  formatShortDate,
  formatStageLabel,
} from "./project-detail-utils";

interface ProjectDetailGlanceProps {
  project: ProjectListItem;
  timeSummary: ProjectTimeSummary;
}

export function ProjectDetailGlance({ project, timeSummary }: ProjectDetailGlanceProps) {
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
          <strong>{project.managingOfficeName}</strong>
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Lead</span>
          <span className="pd-person-chip">
            <Avatar
              fallbackKey={project.leadPersonId ?? project.id}
              label={project.leadPersonName ?? "Lead"}
              photoUrl={project.leadPersonPhotoUrl}
            />
            <strong>{project.leadPersonName ?? "No lead assigned"}</strong>
          </span>
        </div>
        <div className="pd-glance-pill">
          <span className="pd-glance-label">Stage</span>
          <strong>{formatStageLabel(project.stage)}</strong>
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
      <p className="pd-glance-footnote">
        Originating office: <strong>{project.originatingOfficeName}</strong>
      </p>
    </section>
  );
}
