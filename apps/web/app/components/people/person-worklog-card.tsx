import type { PersonDetailData } from "@mandala/db";

import { ProjectCardHeader } from "../projects/project-card-header";
import {
  Avatar,
  formatDate,
  formatHoursWithUnit,
  formatInrMetric,
  formatTimeSource,
} from "./person-detail-utils";

interface PersonWorklogCardProps {
  person: NonNullable<PersonDetailData["person"]>;
  timeSummary: PersonDetailData["timeSummary"];
}

export function PersonWorklogCard({ person, timeSummary }: PersonWorklogCardProps) {
  return (
    <section className="pd-card">
      <ProjectCardHeader title="Work log" />

      <div className="pd-log-summary">
        <div>
          <span className="pd-meta-label">Total hours</span>
          <strong>{formatHoursWithUnit(timeSummary.totalHours)}</strong>
        </div>
        <div>
          <span className="pd-meta-label">Total labor cost</span>
          <strong>{formatInrMetric(timeSummary.totalLaborCost)}</strong>
        </div>
      </div>

      <div className="pd-list">
        {timeSummary.recentEntries.length === 0 ? (
          <p className="pd-empty">No worklog entries yet.</p>
        ) : (
          timeSummary.recentEntries.map((entry) => {
            const entryCost = entry.hours * person.hourlyCost;

            return (
              <article className="pd-list-item" key={entry.id}>
                <div className="pd-list-item-main pd-list-item-main-column">
                  <span className="pd-person-chip">
                    <Avatar fallbackKey={entry.projectId} label={entry.projectName} variant="project" />
                    <span>{entry.projectName}</span>
                  </span>
                  <p className="pd-meta-text">
                    {formatDate(entry.date)} · {formatHoursWithUnit(entry.hours)} · {formatInrMetric(entryCost)}
                  </p>
                  {entry.notes ? <p className="pd-meta-text">{entry.notes}</p> : null}
                </div>
                <div className="pd-list-item-aside">
                  <span className="pd-meta-text">{formatTimeSource(entry.source)}</span>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
