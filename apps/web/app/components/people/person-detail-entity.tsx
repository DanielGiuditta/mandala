import type { PersonDetailData, UpdatePersonInput } from "@mandala/db";
import type { ReactNode } from "react";

import { EntityHeader } from "../entity-header";
import { EntityPhoto } from "../projects/project-detail-utils";
import { PersonDetailCloseButton } from "./person-detail-close-button";
import { PersonCreateModal } from "./person-create-modal";
import type {
  PersonCreateOfficeOption,
  PersonCreateSupervisorOption,
} from "./person-create-types";
import { PersonDetailGlance } from "./person-detail-glance";
import { PersonProjectsCard } from "./person-projects-card";
import { PersonResourcesCard } from "./person-resources-card";
import { PersonTasksCard } from "./person-tasks-card";
import { PersonWorklogCard } from "./person-worklog-card";

interface PersonDetailEntityProps {
  closeControl?: ReactNode;
  data: PersonDetailData;
  loadSupervisorOptionsAction: () => Promise<{
    forbidden: boolean;
    people: PersonCreateSupervisorOption[];
  }>;
  officeOptions: PersonCreateOfficeOption[];
  onResendPersonAccountEmailAction: (
    input: { personId: string },
  ) => Promise<{ message: string }>;
  onUpdatePersonAction: (
    input: UpdatePersonInput,
  ) => Promise<{ personId: string }>;
  titleSuggestions: string[];
}

export function PersonDetailEntity({
  closeControl,
  data,
  loadSupervisorOptionsAction,
  officeOptions,
  onResendPersonAccountEmailAction,
  onUpdatePersonAction,
  titleSuggestions,
}: PersonDetailEntityProps) {
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
        action={
          <div className="entity-header-action-group">
            <PersonCreateModal
              disabled={!data.canEdit}
              disabledReason={!data.canEdit ? "Only admins and partners can edit this person." : undefined}
              initialFormInput={{
                annualSalary: String(data.person.annualSalary),
                email: data.person.email ?? "",
                fullName: data.person.fullName,
                officeId: data.person.officeId,
                permission: data.person.effectivePermission,
                photoFile: null,
                photoUrl: data.person.photoUrl ?? null,
                supervisorPersonId: data.person.supervisorPersonId ?? "",
                title: data.person.title ?? "",
              }}
              loadSupervisorOptionsAction={loadSupervisorOptionsAction}
              mode="edit"
              officeOptions={officeOptions}
              onResendPersonAccountEmailAction={onResendPersonAccountEmailAction}
              onUpdatePersonAction={onUpdatePersonAction}
              personId={data.person.id}
              titleSuggestions={titleSuggestions}
              trigger="edit"
            />
            {closeControl ?? <PersonDetailCloseButton />}
          </div>
        }
        className="pd-entity-header"
        media={
          <EntityPhoto
            entityId={data.person.id}
            label={data.person.fullName}
            photoUrl={data.person.photoUrl}
            variant="person"
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
