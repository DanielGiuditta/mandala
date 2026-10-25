import {
  getProjectDetail,
  listPeopleOptions,
  listProjectRailData,
  listProjects,
  type PeopleOptionsData,
  type ProjectDetailData,
  type ProjectListData,
  type ProjectListFilters,
  type ProjectRailData,
  type ViewerRequestContext,
} from "@mandala/db";
import { unstable_cache } from "next/cache";

// Reads that include tracked hours are never wrapped in unstable_cache. The
// Windows agent saves time directly in Postgres, so nothing can invalidate a
// Next.js data cache when it does, and unstable_cache serves a stale entry of
// any age before refreshing it. Only names, photos and option lists are cached.

const PROJECTS_TAG = "projects";
const PEOPLE_OPTIONS_TAG = "people-options";
const PROJECTS_REVALIDATE_SECONDS = 300;

function filterProjects(
  data: ProjectListData,
  filters: ProjectListFilters,
): ProjectListData {
  const query = filters.query?.trim().toLowerCase();

  return {
    ...data,
    filters,
    projects: data.projects.filter((project) => {
      if (filters.stage && project.stage !== filters.stage) {
        return false;
      }

      if (
        filters.officeId &&
        project.originatingOfficeId !== filters.officeId &&
        project.managingOfficeId !== filters.officeId
      ) {
        return false;
      }

      return !query || [
        project.name,
        project.clientName ?? "",
        project.description ?? "",
      ].some((value) => value.toLowerCase().includes(query));
    }),
  };
}

function getViewerCacheKey(context: ViewerRequestContext): string {
  return context.sessionEmail?.trim().toLowerCase() ?? "anonymous";
}

export function getProjectsTag(): string {
  return PROJECTS_TAG;
}

export function getProjectTag(projectId: string): string {
  return `project:${projectId}`;
}

export function getPeopleOptionsTag(): string {
  return PEOPLE_OPTIONS_TAG;
}

// Includes project hours: always read live.
export async function loadProjects(
  filters: ProjectListFilters,
  context: ViewerRequestContext,
): Promise<ProjectListData> {
  return filterProjects(await listProjects({}, context), filters);
}

// Includes project hours and the work log: always read live.
export async function loadProjectDetail(
  projectId: string,
  context: ViewerRequestContext,
): Promise<ProjectDetailData> {
  return getProjectDetail(projectId, context);
}

export async function getCachedProjectRailData(
  context: ViewerRequestContext,
): Promise<ProjectRailData> {
  return unstable_cache(
    async () => listProjectRailData(context),
    ["project-rail", getViewerCacheKey(context)],
    {
      revalidate: PROJECTS_REVALIDATE_SECONDS,
      tags: [PROJECTS_TAG],
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
      revalidate: PROJECTS_REVALIDATE_SECONDS,
      tags: [PEOPLE_OPTIONS_TAG],
    },
  )();
}
