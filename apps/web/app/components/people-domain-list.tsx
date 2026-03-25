import type { PeopleListData } from "@mandala/db";

import { EntityHeader } from "./entity-header";
import { PeopleAddButton } from "./people/people-add-button";
import { PeopleListFilters } from "./people/people-list-filters";
import { PeopleListTable } from "./people/people-list-table";

interface PeopleDomainListProps {
  data: PeopleListData;
}

export function PeopleDomainList({ data }: PeopleDomainListProps) {
  return (
    <section className="people-domain">
      <EntityHeader
        action={<PeopleAddButton />}
        className="people-domain-header"
        title="People"
      />

      <PeopleListFilters
        filters={data.filters}
        forbidden={data.forbidden}
      />

      <PeopleListTable
        configured={data.configured}
        forbidden={data.forbidden}
        people={data.people}
      />

      {!data.configured && data.configMessage ? (
        <div className="people-notice-dock">
          <div className="notice">{data.configMessage}</div>
          {data.accessMessage ? <div className="notice">{data.accessMessage}</div> : null}
        </div>
      ) : data.accessMessage ? (
        <div className="people-notice-dock">
          <div className="notice">{data.accessMessage}</div>
        </div>
      ) : null}
    </section>
  );
}
