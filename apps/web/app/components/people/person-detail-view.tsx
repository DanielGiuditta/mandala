import type { PersonDetailData, PersonRailItem, UpdatePersonInput } from "@mandala/db";
import type { ReactNode } from "react";

import { PersonDetailShell } from "./person-detail-shell";
import type {
  PersonAccountEmailActionResult,
  PersonMutationActionResult,
} from "./person-action-results";
import type {
  PersonCreateOfficeOption,
  PersonCreateSupervisorOption,
} from "./person-create-types";

interface PersonDetailViewProps {
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

export function PersonDetailView({
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
}: PersonDetailViewProps) {
  return (
    <PersonDetailShell
      closeControl={closeControl}
      data={data}
      loadProjectOptionsAction={loadProjectOptionsAction}
      loadSupervisorOptionsAction={loadSupervisorOptionsAction}
      officeOptions={officeOptions}
      onAddProjectAction={onAddProjectAction}
      onResendPersonAccountEmailAction={onResendPersonAccountEmailAction}
      onRemovePersonAction={onRemovePersonAction}
      onUpdatePersonAction={onUpdatePersonAction}
      personId={personId}
      railPeople={railPeople}
    />
  );
}
