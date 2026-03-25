import { notFound } from "next/navigation";

import { getViewerRequestContext } from "../../../lib/auth/session";
import { PersonDetailView } from "../../components/people/person-detail-view";
import { loadPeopleOptionsAction, updatePersonAction } from "../actions";
import { getCachedPeople, getCachedPersonDetail } from "../data-cache";

interface PersonDetailPageProps {
  params: Promise<{
    personId: string
  }>
}

export const dynamic = "force-dynamic"

export default async function PersonDetailPage({ params }: PersonDetailPageProps) {
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
    <PersonDetailView
      data={data}
      loadSupervisorOptionsAction={loadPeopleOptionsAction}
      officeOptions={listData.offices}
      onUpdatePersonAction={updatePersonAction}
      personId={personId}
      railPeople={listData.people}
    />
  );
}
