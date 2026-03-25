import type { PersonDetailData, PersonListItem } from "@mandala/db";
import type { ReactNode } from "react";

import { PersonDetailShell } from "./person-detail-shell";

interface PersonDetailViewProps {
  closeControl?: ReactNode;
  data: PersonDetailData;
  personId: string;
  railPeople: PersonListItem[];
}

export function PersonDetailView({
  closeControl,
  data,
  personId,
  railPeople,
}: PersonDetailViewProps) {
  return (
    <PersonDetailShell
      closeControl={closeControl}
      data={data}
      personId={personId}
      railPeople={railPeople}
    />
  );
}
