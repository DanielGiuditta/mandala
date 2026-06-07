import type { PersonDetailData, PersonRailItem, UpdatePersonInput } from "@mandala/db";

import { EntityModal } from "../entity-modal";
import { PersonDetailCloseButton } from "./person-detail-close-button";
import { PersonDetailShell } from "./person-detail-shell";
import type {
  PersonAccountEmailActionResult,
  PersonMutationActionResult,
} from "./person-action-results";
import type {
  PersonCreateOfficeOption,
  PersonCreateSupervisorOption,
} from "./person-create-types";

interface PersonDetailOverlayProps {
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

export function PersonDetailOverlay({
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
}: PersonDetailOverlayProps) {
  return (
    <EntityModal
      panelClassName="entity-modal-panel-project-workspace"
      showBackdrop={false}
    >
      <PersonDetailShell
        closeControl={<PersonDetailCloseButton />}
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
    </EntityModal>
  );
}
