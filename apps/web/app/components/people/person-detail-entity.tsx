import type { PersonDetailData } from "@mandala/db";
import type { ReactNode } from "react";

import { EntityHeader } from "../entity-header";
import { PersonDetailCloseButton } from "./person-detail-close-button";
import { PersonDetailGlance } from "./person-detail-glance";
import { PersonProjectsCard } from "./person-projects-card";
import { PersonResourcesCard } from "./person-resources-card";
import { PersonTasksCard } from "./person-tasks-card";
import { Avatar } from "./person-detail-utils";
import { PersonWorklogCard } from "./person-worklog-card";

interface PersonDetailEntityProps {
  closeControl?: ReactNode;
  data: PersonDetailData;
}

export function PersonDetailEntity({ closeControl, data }: PersonDetailEntityProps) {
  if (!data.person) {
    return (
      <section className="pd-card">
        <h2 className="pd-card-title">Person detail</h2>
        <p className="pd-empty">Configure the database connection to load live person data.</p>
      </section>
    );
  }

  return (
    <section className="pd-entity">
      <EntityHeader
        action={closeControl ?? <PersonDetailCloseButton />}
        className="pd-entity-header"
        media={
          <Avatar
            fallbackKey={data.person.id}
            label={data.person.fullName}
            photoUrl={data.person.photoUrl}
            size="lg"
          />
        }
        title={data.person.fullName}
      />
      <div className="pd-entity-content">
        <PersonDetailGlance person={data.person} />

        <div className="pd-columns">
          <div className="pd-col-main">
            <PersonWorklogCard person={data.person} timeSummary={data.timeSummary} />
            <PersonTasksCard checklistItems={data.checklistItems} />
          </div>
          <div className="pd-col-side">
            <PersonProjectsCard person={data.person} timeSummary={data.timeSummary} />
            <PersonResourcesCard />
          </div>
        </div>

        {!data.configured && data.configMessage ? <div className="notice pd-notice">{data.configMessage}</div> : null}
        {data.accessMessage ? <div className="notice pd-notice">{data.accessMessage}</div> : null}
      </div>
    </section>
  );
}
