import { notFound } from "next/navigation";

import { PersonDetailOverlay } from "../../../components/people/person-detail-overlay";
import { getViewerRequestContext } from "../../../../lib/auth/session";
import {
  loadPeopleOptionsAction,
  resendPersonAccountEmailAction,
  updatePersonAction,
} from "../../actions";
import { getCachedPeople, getCachedPersonDetail } from "../../data-cache";

interface PersonDetailModalPageProps {
  params: Promise<{
    personId: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function PersonDetailModalPage({
  params,
}: PersonDetailModalPageProps) {
  const { personId } = await params;
  const viewerContext = await getViewerRequestContext();
  const [data, listData] = await Promise.all([
    getCachedPersonDetail(personId, viewerContext),
    getCachedPeople({}, viewerContext),
  ]);

  if (data.configured && !data.person && !data.forbidden) {
    notFound();
  }

  return (
    <PersonDetailOverlay
      data={data}
      loadSupervisorOptionsAction={loadPeopleOptionsAction}
      officeOptions={listData.offices}
      onResendPersonAccountEmailAction={resendPersonAccountEmailAction}
      onUpdatePersonAction={updatePersonAction}
      personId={personId}
      railPeople={listData.people}
    />
  );
}
