import type { PersonDetailData, PersonListItem } from "@mandala/db";
import type { ReactNode } from "react";

import { PersonDetailEntity } from "./person-detail-entity";
import { PersonDetailRail } from "./person-detail-rail";

interface PersonDetailShellProps {
  closeControl?: ReactNode;
  data: PersonDetailData;
  personId: string;
  railPeople: PersonListItem[];
}

export function PersonDetailShell({
  closeControl,
  data,
  personId,
  railPeople,
}: PersonDetailShellProps) {
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
        <PersonDetailEntity closeControl={closeControl} data={data} />
      </div>
    </main>
  );
}
