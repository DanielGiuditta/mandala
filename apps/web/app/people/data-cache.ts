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

// Reads that include tracked hours are never wrapped in unstable_cache. The
// Windows agent saves time directly in Postgres, so nothing can invalidate a
// Next.js data cache when it does, and unstable_cache serves a stale entry of
// any age before refreshing it. Only names, photos and option lists are cached.

const PEOPLE_TAG = "people";
const PEOPLE_OPTIONS_TAG = "people-options";
const PEOPLE_REVALIDATE_SECONDS = 300;

function filterPeople(
  data: PeopleListData,
  filters: PeopleListFilters,
): PeopleListData {
  const query = filters.query?.trim().toLowerCase();

  return {
    ...data,
    filters,
    people: data.people.filter((person) => {
      if (filters.officeId && person.officeId !== filters.officeId) {
        return false;
      }

      return !query || [
        person.fullName,
        person.title ?? "",
        person.email ?? "",
      ].some((value) => value.toLowerCase().includes(query));
    }),
  };
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

// Includes hours this week: always read live.
export async function loadPeople(
  filters: PeopleListFilters,
  context: ViewerRequestContext,
): Promise<PeopleListData> {
  return filterPeople(await listPeople({}, context), filters);
}

// Includes the person's hours and work log: always read live.
export async function loadPersonDetail(
  personId: string,
  context: ViewerRequestContext,
): Promise<PersonDetailData> {
  return getPersonDetail(personId, context);
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
