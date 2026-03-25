import type { PersonDetailData, PersonListItem } from "@mandala/db";

import { EntityModal } from "../entity-modal";
import { PersonDetailCloseButton } from "./person-detail-close-button";
import { PersonDetailShell } from "./person-detail-shell";

interface PersonDetailOverlayProps {
  data: PersonDetailData;
  personId: string;
  railPeople: PersonListItem[];
}

export function PersonDetailOverlay({
  data,
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
        personId={personId}
        railPeople={railPeople}
      />
    </EntityModal>
  );
}
