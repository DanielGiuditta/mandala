import type { PersonDetailChecklistItem } from "@mandala/db";

import { ProjectCardHeader } from "../projects/project-card-header";
import { formatDate } from "./person-detail-utils";

interface PersonTasksCardProps {
  checklistItems: PersonDetailChecklistItem[];
}

export function PersonTasksCard({ checklistItems }: PersonTasksCardProps) {
  return (
    <section className="pd-card">
      <ProjectCardHeader title="Tasks" />
      <div className="pd-list">
        {checklistItems.length === 0 ? (
          <p className="pd-empty">No assigned checklist items.</p>
        ) : (
          checklistItems.map((item) => (
            <article className="pd-list-item" key={item.id}>
              <div className="pd-list-item-main pd-list-item-main-column">
                <h4 className={item.completed ? "pd-list-item-title-complete" : ""}>{item.title}</h4>
                <p className="pd-meta-text">Project: {item.projectName}</p>
              </div>
              <div className="pd-list-item-aside">
                <span className="pd-meta-text">
                  {item.completed
                    ? `Completed ${formatDate(item.completedAt)}`
                    : `Created ${formatDate(item.createdAt)}`}
                </span>
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}
