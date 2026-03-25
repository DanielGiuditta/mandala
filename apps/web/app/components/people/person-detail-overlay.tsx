import type { PersonDetailData, PersonListItem, UpdatePersonInput } from "@mandala/db";

import { EntityModal } from "../entity-modal";
import { PersonDetailCloseButton } from "./person-detail-close-button";
import { PersonDetailShell } from "./person-detail-shell";
import type {
  PersonCreateOfficeOption,
  PersonCreateSupervisorOption,
} from "./person-create-types";

interface PersonDetailOverlayProps {
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
  personId: string;
  railPeople: PersonListItem[];
}

export function PersonDetailOverlay({
  data,
  loadSupervisorOptionsAction,
  officeOptions,
  onResendPersonAccountEmailAction,
  onUpdatePersonAction,
  personId,
  railPeople,
}: PersonDetailOverlayProps) {
  return (
    <EntityModal
      panelClassName="entity-modal-panel-project-workspace"
      showBackdrop={false}
    >
      <PersonDetailShell
        closeControl={<PersonDetailCloseButton preferBack />}
        data={data}
        loadSupervisorOptionsAction={loadSupervisorOptionsAction}
        officeOptions={officeOptions}
        onResendPersonAccountEmailAction={onResendPersonAccountEmailAction}
        onUpdatePersonAction={onUpdatePersonAction}
        personId={personId}
        railPeople={railPeople}
      />
    </EntityModal>
  );
}
