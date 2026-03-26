import { createPerfTrace } from "@mandala/db";
import { notFound } from "next/navigation";

import { PersonDetailOverlay } from "../../../components/people/person-detail-overlay";
import { getViewerRequestContext } from "../../../../lib/auth/session";
import {
  loadPeopleOptionsAction,
  resendPersonAccountEmailAction,
  updatePersonAction,
} from "../../actions";
import {
  getCachedPeopleOfficeOptions,
  getCachedPeopleRailData,
  getCachedPersonDetail,
} from "../../data-cache";

interface PersonDetailModalPageProps {
  params: Promise<{
    personId: string;
  }>;
}

export const dynamic = "force-dynamic";

export default async function PersonDetailModalPage({
  params,
}: PersonDetailModalPageProps) {
  const trace = createPerfTrace("app.people.personDetail.modal");
  const { personId } = await trace.measure("resolveParams", () => params);
  const viewerContext = await trace.measure("getViewerRequestContext", () =>
    getViewerRequestContext(),
  );
  const [data, officeData, railData] = await trace.measure("loadDetailShellData", () =>
    Promise.all([
      getCachedPersonDetail(personId, viewerContext),
      getCachedPeopleOfficeOptions(viewerContext),
      getCachedPeopleRailData(viewerContext),
    ]),
  );

  if (data.configured && !data.person && !data.forbidden) {
    notFound();
  }

  trace.finish({
    forbidden: data.forbidden,
    hasPerson: Boolean(data.person),
    railCount: railData.people.length,
    result: "ok",
  });

  return (
    <PersonDetailOverlay
      data={data}
      loadSupervisorOptionsAction={loadPeopleOptionsAction}
      officeOptions={officeData.offices}
      onResendPersonAccountEmailAction={resendPersonAccountEmailAction}
      onUpdatePersonAction={updatePersonAction}
      personId={personId}
      railPeople={railData.people}
    />
  );
}
