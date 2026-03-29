"use server";

import type {
  CreatePersonInput,
  PeopleOptionRow,
  ResendPersonAccountEmailInput,
  UpdatePersonInput,
} from "@mandala/db";
import {
  createProjectAssignment,
  createPerson,
  invalidatePeopleReadCaches,
  invalidateProjectReadCaches,
  resendPersonAccountEmail,
  updatePerson,
} from "@mandala/db";
import { revalidatePath, revalidateTag } from "next/cache";

import { getViewerRequestContext } from "../../lib/auth/session";
import { getCachedProjectRailData, getProjectTag, getProjectsTag } from "../projects/data-cache";
import {
  getCachedPeopleOptions,
  getPeopleOptionsTag,
  getPeopleTag,
} from "./data-cache";

export async function createPersonAction(
  input: CreatePersonInput,
): Promise<{ personId: string }> {
  const viewerContext = await getViewerRequestContext();
  const person = await createPerson(input, viewerContext);

  invalidatePeopleReadCaches();
  invalidateProjectReadCaches();
  revalidateTag(getPeopleTag());
  revalidateTag(getPeopleOptionsTag());
  revalidateTag(getProjectsTag());
  revalidatePath("/people");
  revalidatePath("/projects");

  return { personId: person.id };
}

export async function updatePersonAction(
  input: UpdatePersonInput,
): Promise<{ personId: string }> {
  const viewerContext = await getViewerRequestContext();
  const person = await updatePerson(input, viewerContext);

  invalidatePeopleReadCaches();
  invalidateProjectReadCaches();
  revalidateTag(getPeopleTag());
  revalidateTag(getPeopleOptionsTag());
  revalidateTag(getProjectsTag());
  revalidatePath("/people");
  revalidatePath(`/people/${person.id}`);
  revalidatePath("/projects");

  return { personId: person.id };
}

export async function resendPersonAccountEmailAction(
  input: ResendPersonAccountEmailInput,
): Promise<{ message: string }> {
  const viewerContext = await getViewerRequestContext();
  const result = await resendPersonAccountEmail(input, viewerContext);

  return {
    message:
      result.delivery === "invite"
        ? `Invite email sent to ${result.email}.`
        : `Password email sent to ${result.email}.`,
  };
}

export async function loadPeopleOptionsAction(): Promise<{
  forbidden: boolean;
  people: PeopleOptionRow[];
}> {
  const viewerContext = await getViewerRequestContext();
  return getCachedPeopleOptions(viewerContext);
}

export async function loadProjectOptionsAction(): Promise<{
  forbidden: boolean;
  projects: Array<{ id: string; name: string; photoUrl: string | null }>;
}> {
  const viewerContext = await getViewerRequestContext();
  const data = await getCachedProjectRailData(viewerContext);

  return {
    forbidden: data.forbidden,
    projects: data.projects,
  };
}

export async function addPersonProjectAction(input: {
  personId: string;
  projectId: string;
}): Promise<{ error: string | null; ok: boolean }> {
  try {
    const viewerContext = await getViewerRequestContext();
    await createProjectAssignment(
      {
        assignedHoursPerWeek: 1,
        personId: input.personId,
        projectId: input.projectId,
      },
      viewerContext,
    );

    invalidatePeopleReadCaches();
    invalidateProjectReadCaches();
    revalidateTag(getPeopleTag());
    revalidateTag(getPeopleOptionsTag());
    revalidateTag(getProjectsTag());
    revalidateTag(getProjectTag(input.projectId));
    revalidatePath("/people");
    revalidatePath(`/people/${input.personId}`);
    revalidatePath("/projects");
    revalidatePath(`/projects/${input.projectId}`);

    return { error: null, ok: true };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Unable to add project.",
      ok: false,
    };
  }
}
