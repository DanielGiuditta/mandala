import { notFound } from "next/navigation";

import { PersonDetailOverlay } from "../../../components/people/person-detail-overlay";
import { getViewerRequestContext } from "../../../../lib/auth/session";
import { getCachedPeopleRailData, getCachedPersonDetail } from "../../data-cache";

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
  const [data, railData] = await Promise.all([
    getCachedPersonDetail(personId, viewerContext),
    getCachedPeopleRailData(viewerContext),
  ]);

  if (data.configured && !data.person && !data.forbidden) {
    notFound();
  }

  return <PersonDetailOverlay data={data} personId={personId} railPeople={railData.people} />;
}
