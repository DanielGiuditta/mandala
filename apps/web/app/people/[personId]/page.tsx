import { createPerfTrace } from "@mandala/db";
import { notFound } from "next/navigation";

import { getViewerRequestContext } from "../../../lib/auth/session";
import { PersonDetailView } from "../../components/people/person-detail-view";
import {
  addPersonProjectAction,
  loadProjectOptionsAction,
  loadPeopleOptionsAction,
  resendPersonAccountEmailAction,
  updatePersonAction,
} from "../actions";
import {
  getCachedPeopleOfficeOptions,
  getCachedPeopleRailData,
  getCachedPersonDetail,
} from "../data-cache";

interface PersonDetailPageProps {
  params: Promise<{
    personId: string
  }>
}

export const dynamic = "force-dynamic"

export default async function PersonDetailPage({ params }: PersonDetailPageProps) {
  const trace = createPerfTrace("app.people.personDetail.page");
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
    <PersonDetailView
      loadProjectOptionsAction={loadProjectOptionsAction}
      data={data}
      loadSupervisorOptionsAction={loadPeopleOptionsAction}
      onAddProjectAction={addPersonProjectAction}
      officeOptions={officeData.offices}
      onResendPersonAccountEmailAction={resendPersonAccountEmailAction}
      onUpdatePersonAction={updatePersonAction}
      personId={personId}
      railPeople={railData.people}
    />
  );
}
