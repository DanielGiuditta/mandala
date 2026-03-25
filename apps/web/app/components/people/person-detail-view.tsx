import type { PersonDetailData, PersonListItem, UpdatePersonInput } from "@mandala/db";
import type { ReactNode } from "react";

import { PersonDetailShell } from "./person-detail-shell";
import type {
  PersonCreateOfficeOption,
  PersonCreateSupervisorOption,
} from "./person-create-types";

interface PersonDetailViewProps {
  closeControl?: ReactNode;
  data: PersonDetailData;
  loadSupervisorOptionsAction: () => Promise<{
    forbidden: boolean;
    people: PersonCreateSupervisorOption[];
  }>;
  officeOptions: PersonCreateOfficeOption[];
  onUpdatePersonAction: (
    input: UpdatePersonInput,
  ) => Promise<{ personId: string }>;
  personId: string;
  railPeople: PersonListItem[];
}

export function PersonDetailView({
  closeControl,
  data,
  loadSupervisorOptionsAction,
  officeOptions,
  onUpdatePersonAction,
  personId,
  railPeople,
}: PersonDetailViewProps) {
  return (
    <PersonDetailShell
      closeControl={closeControl}
      data={data}
      loadSupervisorOptionsAction={loadSupervisorOptionsAction}
      officeOptions={officeOptions}
      onUpdatePersonAction={onUpdatePersonAction}
      personId={personId}
      railPeople={railPeople}
    />
  );
}
