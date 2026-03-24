import { notFound } from "next/navigation";

import { EntityModal } from "../../../components/entity-modal";
import { EntityReturnButton } from "../../../components/entity-return-button";
import { PersonDetailView } from "../../../components/people/person-detail-view";
import { getViewerRequestContext } from "../../../../lib/auth/session";
import { getCachedPersonDetail } from "../../data-cache";

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
  const data = await getCachedPersonDetail(personId, viewerContext);

  if (data.configured && !data.person && !data.forbidden) {
    notFound();
  }

  return (
    <EntityModal panelClassName="entity-modal-panel-people">
      <PersonDetailView
        data={data}
        returnControl={
          <EntityReturnButton
            className="secondary"
            fallbackHref="/people"
            label="Back to people"
            scope="people"
          />
        }
      />
    </EntityModal>
  );
}
