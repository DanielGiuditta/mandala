import type {
  CreatePersonInput,
  PeopleListData,
  PeopleOptionRow,
  UpdatePersonInput,
} from "@mandala/db";

import { EntityHeader } from "./entity-header";
import { PersonCreateModal } from "./people/person-create-modal";
import { PeopleListFilters } from "./people/people-list-filters";
import { PeopleListTable } from "./people/people-list-table";

interface PeopleDomainListProps {
  data: PeopleListData;
  loadProjectOptionsAction: () => Promise<{
    forbidden: boolean;
    projects: Array<{ id: string; name: string; photoUrl: string | null }>;
  }>;
  loadSupervisorOptionsAction: () => Promise<{
    forbidden: boolean;
    people: PeopleOptionRow[];
  }>;
  onAddProjectAction: (
    input: { personId: string; projectId: string },
  ) => Promise<{ error: string | null; ok: boolean }>;
  onCreatePersonAction: (
    input: CreatePersonInput,
  ) => Promise<{ personId: string }>;
  onUpdatePersonAction: (
    input: UpdatePersonInput,
  ) => Promise<{ personId: string }>;
}

export function PeopleDomainList({
  data,
  loadProjectOptionsAction,
  loadSupervisorOptionsAction,
  onAddProjectAction,
  onCreatePersonAction,
  onUpdatePersonAction,
}: PeopleDomainListProps) {
  const titleSuggestions = Array.from(
    new Set(
      data.people
        .map((person) => person.title?.trim())
        .filter((title): title is string => Boolean(title)),
    ),
  ).sort((left, right) => left.localeCompare(right));
  const createDisabledReason = !data.configured
    ? "Configure the database connection to create people."
    : data.offices.length === 0
      ? "At least one office is required before creating people."
      : undefined;

  return (
    <section className="people-domain">
      <EntityHeader
        action={
          <PersonCreateModal
            disabled={Boolean(createDisabledReason)}
            disabledReason={createDisabledReason}
            loadSupervisorOptionsAction={loadSupervisorOptionsAction}
            officeOptions={data.offices}
            onCreatePersonAction={onCreatePersonAction}
            titleSuggestions={titleSuggestions}
          />
        }
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
        loadProjectOptionsAction={loadProjectOptionsAction}
        loadSupervisorOptionsAction={loadSupervisorOptionsAction}
        onAddProjectAction={onAddProjectAction}
        officeOptions={data.offices}
        onUpdatePersonAction={onUpdatePersonAction}
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
