import type { PersonDetailData } from "@mandala/db";

import { EntityReturnLink } from "../entity-return-link";
import { ProjectCardHeader } from "../projects/project-card-header";
import {
  Avatar,
  formatDate,
  formatHoursWithUnit,
  formatInrMetric,
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
                <div className="pd-list-item-main">
                  <EntityReturnLink
                    className="pd-person-chip pd-person-chip-hug entity-content-link"
                    href={`/projects/${entry.projectId}`}
                    scope="projects"
                  >
                    <Avatar fallbackKey={entry.projectId} label={entry.projectName} variant="project" />
                    <span className="entity-content-link-label">{entry.projectName}</span>
                  </EntityReturnLink>
                </div>
                <div className="pd-list-item-aside">
                  <p className="pd-meta-text">
                    {formatDate(entry.date)} · {formatHoursWithUnit(entry.hours)} · {formatInrMetric(entryCost)}
                  </p>
                </div>
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}
