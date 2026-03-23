"use server";

import type { CreateProjectInput } from "@mandala/db";
import { createProject } from "@mandala/db";
import { revalidatePath } from "next/cache";

import { getViewerRequestContext } from "../../lib/auth/session";

export async function createProjectAction(
  input: CreateProjectInput,
): Promise<{ projectId: string }> {
  const viewerContext = await getViewerRequestContext();
  const project = await createProject(input, viewerContext);

  revalidatePath("/projects");

  return { projectId: project.id };
}
