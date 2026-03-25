"use server";

import type { CreateProjectInput, UpdateProjectInput } from "@mandala/db";
import {
  createProject,
  invalidatePeopleReadCaches,
  invalidateProjectReadCaches,
  updateProject,
} from "@mandala/db";
import { revalidatePath, revalidateTag } from "next/cache";

import { getViewerRequestContext } from "../../lib/auth/session";
import { getPeopleTag, getPeopleOptionsTag } from "../people/data-cache";
import {
  getCachedPeopleOptions,
  getProjectsTag,
} from "./data-cache";

export async function createProjectAction(
  input: CreateProjectInput,
): Promise<{ projectId: string }> {
  const viewerContext = await getViewerRequestContext();
  const project = await createProject(input, viewerContext);

  invalidateProjectReadCaches();
  invalidatePeopleReadCaches();
  revalidateTag(getProjectsTag());
  revalidateTag(getPeopleTag());
  revalidateTag(getPeopleOptionsTag());
  revalidatePath("/projects");
  revalidatePath("/people");

  return { projectId: project.id };
}

export async function updateProjectAction(
  input: UpdateProjectInput,
): Promise<{ projectId: string }> {
  const viewerContext = await getViewerRequestContext();
  const project = await updateProject(input, viewerContext);

  invalidateProjectReadCaches();
  invalidatePeopleReadCaches();
  revalidateTag(getProjectsTag());
  revalidateTag(getPeopleTag());
  revalidateTag(getPeopleOptionsTag());
  revalidatePath("/projects");
  revalidatePath(`/projects/${project.id}`);
  revalidatePath("/people");

  return { projectId: project.id };
}

export async function loadPeopleOptionsAction(): Promise<{
  forbidden: boolean;
  people: Array<{ fullName: string; id: string }>;
}> {
  const viewerContext = await getViewerRequestContext();
  return getCachedPeopleOptions(viewerContext);
}
