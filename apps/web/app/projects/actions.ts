"use server";

import type { CreateProjectInput } from "@mandala/db";
import { createProject, invalidateProjectReadCaches } from "@mandala/db";
import { revalidatePath, revalidateTag } from "next/cache";

import { getViewerRequestContext } from "../../lib/auth/session";
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
  revalidateTag(getProjectsTag());
  revalidatePath("/projects");

  return { projectId: project.id };
}

export async function loadPeopleOptionsAction(): Promise<{
  forbidden: boolean;
  people: Array<{ fullName: string; id: string }>;
}> {
  const viewerContext = await getViewerRequestContext();
  return getCachedPeopleOptions(viewerContext);
}
