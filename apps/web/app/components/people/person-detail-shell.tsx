import type { PersonDetailData, PersonRailItem, UpdatePersonInput } from "@mandala/db";
import type { ReactNode } from "react";

import { PersonDetailEntity } from "./person-detail-entity";
import { PersonDetailRail } from "./person-detail-rail";
import type {
  PersonAccountEmailActionResult,
  PersonMutationActionResult,
} from "./person-action-results";
import type {
  PersonCreateOfficeOption,
  PersonCreateSupervisorOption,
} from "./person-create-types";

interface PersonDetailShellProps {
  closeControl?: ReactNode;
  data: PersonDetailData;
  loadProjectOptionsAction: () => Promise<{
    forbidden: boolean;
    projects: Array<{ id: string; name: string; photoUrl: string | null }>;
  }>;
  loadSupervisorOptionsAction: () => Promise<{
    forbidden: boolean;
    people: PersonCreateSupervisorOption[];
  }>;
  officeOptions: PersonCreateOfficeOption[];
  onAddProjectAction: (
    input: { personId: string; projectId: string },
  ) => Promise<{ error: string | null; ok: boolean }>;
  onResendPersonAccountEmailAction: (
    input: { personId: string },
  ) => Promise<PersonAccountEmailActionResult>;
  onRemovePersonAction: (
    input: { personId: string },
  ) => Promise<PersonMutationActionResult>;
  onUpdatePersonAction: (
    input: UpdatePersonInput,
  ) => Promise<PersonMutationActionResult>;
  personId: string;
  railPeople: PersonRailItem[];
}

export function PersonDetailShell({
  closeControl,
  data,
  loadProjectOptionsAction,
  loadSupervisorOptionsAction,
  officeOptions,
  onAddProjectAction,
  onResendPersonAccountEmailAction,
  onRemovePersonAction,
  onUpdatePersonAction,
  personId,
  railPeople,
}: PersonDetailShellProps) {
  const titleSuggestions = Array.from(
    new Set(
      railPeople
        .map((person) => person.title?.trim())
        .filter((title): title is string => Boolean(title)),
    ),
  ).sort((left, right) => left.localeCompare(right));

  if (data.forbidden) {
    const message =
      data.accessMessage ?? "This viewer does not have access to the requested person.";

    return (
      <main className="pd-page">
        <section className="pd-card">
          <div className="pd-card-header">
            <h2 className="pd-card-title">Person access</h2>
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

  if (!data.person) {
    return (
      <main className="pd-page">
        <section className="pd-card">
          <h2 className="pd-card-title">Person detail</h2>
          <p className="pd-empty">Configure the database connection to load live person data.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="pd-page">
      <div className="pd-layout">
        <PersonDetailRail
          activePersonId={personId}
          configured={data.configured}
          forbidden={data.forbidden}
          people={railPeople}
        />
        <PersonDetailEntity
          closeControl={closeControl}
          data={data}
          loadProjectOptionsAction={loadProjectOptionsAction}
          loadSupervisorOptionsAction={loadSupervisorOptionsAction}
          officeOptions={officeOptions}
          onAddProjectAction={onAddProjectAction}
          onResendPersonAccountEmailAction={onResendPersonAccountEmailAction}
          onRemovePersonAction={onRemovePersonAction}
          onUpdatePersonAction={onUpdatePersonAction}
          titleSuggestions={titleSuggestions}
        />
      </div>
    </main>
  );
}
