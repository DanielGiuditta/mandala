import {
  getPersonDetail,
  listPeople,
  listPeopleOfficeOptions,
  listPeopleOptions,
  listPeopleRailData,
  type PeopleOptionsData,
  type PeopleListData,
  type PeopleListFilters,
  type PeopleOfficeOptionsData,
  type PeopleRailData,
  type PersonDetailData,
  type ViewerRequestContext,
} from "@mandala/db";
import { unstable_cache } from "next/cache";

const PEOPLE_TAG = "people";
const PEOPLE_OPTIONS_TAG = "people-options";
const PEOPLE_REVALIDATE_SECONDS = 300;

function normalizeFilterValue(value?: string | null): string {
  return value?.trim().toLowerCase() ?? "";
}

function getViewerCacheKey(context: ViewerRequestContext): string {
  return context.sessionEmail?.trim().toLowerCase() ?? "anonymous";
}

export function getPeopleTag(): string {
  return PEOPLE_TAG;
}

export function getPeopleOptionsTag(): string {
  return PEOPLE_OPTIONS_TAG;
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
): Promise<Pick<PeopleRailData, "configured" | "forbidden" | "people">> {
  return unstable_cache(
    async () => {
      const data = await listPeopleRailData(context);
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

export async function getCachedPeopleOfficeOptions(
  context: ViewerRequestContext,
): Promise<Pick<PeopleOfficeOptionsData, "configured" | "forbidden" | "offices">> {
  return unstable_cache(
    async () => {
      const data = await listPeopleOfficeOptions(context);

      return {
        configured: data.configured,
        forbidden: data.forbidden,
        offices: data.offices,
      };
    },
    ["people-office-options", getViewerCacheKey(context)],
    {
      revalidate: PEOPLE_REVALIDATE_SECONDS,
      tags: [PEOPLE_TAG],
    },
  )();
}

export async function getCachedPeopleOptions(
  context: ViewerRequestContext,
): Promise<Pick<PeopleOptionsData, "forbidden" | "people">> {
  return unstable_cache(
    async () => {
      const data = await listPeopleOptions(context);

      return {
        forbidden: data.forbidden,
        people: data.people,
      };
    },
    ["people-options", getViewerCacheKey(context)],
    {
      revalidate: PEOPLE_REVALIDATE_SECONDS,
      tags: [PEOPLE_OPTIONS_TAG],
    },
  )();
}
