import {
  getPersonDetail,
  listPeople,
  type PeopleListData,
  type PeopleListFilters,
  type PersonDetailData,
  type PersonListItem,
  type ViewerRequestContext,
} from "@mandala/db";
import { unstable_cache } from "next/cache";

const PEOPLE_TAG = "people";
const PEOPLE_REVALIDATE_SECONDS = 15;

function normalizeFilterValue(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function getViewerCacheKey(context: ViewerRequestContext): string {
  return context.sessionEmail?.trim().toLowerCase() ?? "anonymous";
}

export async function getCachedPeople(
  filters: PeopleListFilters,
  context: ViewerRequestContext,
): Promise<PeopleListData> {
  return unstable_cache(
    async () => listPeople(filters, context),
    [
      "people-list",
      getViewerCacheKey(context),
      normalizeFilterValue(filters.officeId),
      normalizeFilterValue(filters.query),
    ],
    {
      revalidate: PEOPLE_REVALIDATE_SECONDS,
      tags: [PEOPLE_TAG],
    },
  )();
}

export async function getCachedPersonDetail(
  personId: string,
  context: ViewerRequestContext,
): Promise<PersonDetailData> {
  return unstable_cache(
    async () => getPersonDetail(personId, context),
    ["person-detail", getViewerCacheKey(context), personId],
    {
      revalidate: PEOPLE_REVALIDATE_SECONDS,
      tags: [PEOPLE_TAG, `person:${personId}`],
    },
  )();
}

export async function getCachedPeopleRailData(
  context: ViewerRequestContext,
): Promise<{
  configured: boolean;
  forbidden: boolean;
  people: PersonListItem[];
}> {
  return unstable_cache(
    async () => {
      const data = await listPeople({}, context);
      return {
        configured: data.configured,
        forbidden: data.forbidden,
        people: data.people,
      };
    },
    ["people-rail", getViewerCacheKey(context)],
    {
      revalidate: PEOPLE_REVALIDATE_SECONDS,
      tags: [PEOPLE_TAG],
    },
  )();
}
