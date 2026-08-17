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

export async function getCachedProjects(
  filters: ProjectListFilters,
  context: ViewerRequestContext,
): Promise<ProjectListData> {
  const data = await unstable_cache(
    async () => listProjects({}, context),
    ["projects-list", getViewerCacheKey(context)],
    {
      revalidate: PROJECTS_REVALIDATE_SECONDS,
      tags: [PROJECTS_TAG],
    },
  )();

  return filterProjects(data, filters);
}

export async function getCachedProjectDetail(
  projectId: string,
  context: ViewerRequestContext,
): Promise<ProjectDetailData> {
  return unstable_cache(
    async () => getProjectDetail(projectId, context),
    ["project-detail", getViewerCacheKey(context), projectId],
    {
      revalidate: PROJECTS_REVALIDATE_SECONDS,
      tags: [PROJECTS_TAG, getProjectTag(projectId)],
    },
  )();
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
