import type { SelfTimeTrackerData } from "@mandala/db";

import { EntityHeader } from "./entity-header";
import { TimeTrackerListTable } from "./time-tracker/time-tracker-list-table";

interface TimeTrackerDomainListProps {
  data: SelfTimeTrackerData;
}

export function TimeTrackerDomainList({
  data,
}: TimeTrackerDomainListProps) {
  return (
    <section className="projects-domain">
      <EntityHeader
        className="projects-domain-header"
        title="Time tracker"
      />

      <TimeTrackerListTable
        configured={data.configured}
        forbidden={data.forbidden}
        projects={data.projects}
      />

      {!data.configured && data.configMessage ? (
        <div className="projects-notice-dock">
          <div className="notice">{data.configMessage}</div>
          {data.accessMessage ? (
            <div className="notice">{data.accessMessage}</div>
          ) : null}
        </div>
      ) : data.accessMessage ? (
        <div className="projects-notice-dock">
          <div className="notice">{data.accessMessage}</div>
        </div>
      ) : null}
    </section>
  );
}
