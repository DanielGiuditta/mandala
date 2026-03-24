"use server";

import type { CreateProjectInput, PeopleOptionsData } from "@mandala/db";
import { createProject, invalidateProjectReadCaches, listPeopleOptions } from "@mandala/db";
import { revalidatePath } from "next/cache";

import { getViewerRequestContext } from "../../lib/auth/session";

export async function createProjectAction(
  input: CreateProjectInput,
): Promise<{ projectId: string }> {
  const viewerContext = await getViewerRequestContext();
  const project = await createProject(input, viewerContext);

  invalidateProjectReadCaches();
  revalidatePath("/projects");

  return { projectId: project.id };
}

export async function loadPeopleOptionsAction(): Promise<Pick<PeopleOptionsData, "forbidden" | "people">> {
  const viewerContext = await getViewerRequestContext();
  const data = await listPeopleOptions(viewerContext);

  return {
    forbidden: data.forbidden,
    people: data.people,
  };
}
