"use server";

import type {
  CreatePersonInput,
  PeopleOptionRow,
  RemovePersonInput,
  ResendPersonAccountEmailInput,
  UpdatePersonInput,
} from "@mandala/db";
import {
  createProjectAssignment,
  createPerson,
  invalidatePeopleReadCaches,
  invalidateProjectReadCaches,
  removePerson,
  resendPersonAccountEmail,
  updatePerson,
} from "@mandala/db";
import { revalidatePath, revalidateTag } from "next/cache";

import type {
  PersonAccountEmailActionResult,
  PersonMutationActionResult,
} from "../components/people/person-action-results";
import { getViewerRequestContext } from "../../lib/auth/session";
import { getCachedProjectRailData, getProjectTag, getProjectsTag } from "../projects/data-cache";
import {
  getCachedPeopleOptions,
  getPeopleOptionsTag,
  getPeopleTag,
} from "./data-cache";

function getActionErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string" &&
    error.message.trim()
  ) {
    return error.message
  }

  return fallback
}

function actionFailure(error: unknown, fallback: string): PersonMutationActionResult {
  return {
    error: getActionErrorMessage(error, fallback),
    ok: false,
    personId: "",
  }
}

function actionSuccess(personId: string): PersonMutationActionResult {
  return {
    error: null,
    ok: true,
    personId,
  }
}

function emailActionFailure(
  error: unknown,
  fallback: string,
): PersonAccountEmailActionResult {
  const message = getActionErrorMessage(error, fallback)

  return {
    error: message,
    message,
    ok: false,
  }
}

export async function createPersonAction(
  input: CreatePersonInput,
): Promise<PersonMutationActionResult> {
  try {
    const viewerContext = await getViewerRequestContext();
    const person = await createPerson(input, viewerContext);

    invalidatePeopleReadCaches();
    invalidateProjectReadCaches();
    revalidateTag(getPeopleTag());
    revalidateTag(getPeopleOptionsTag());
    revalidateTag(getProjectsTag());
    revalidatePath("/people");
    revalidatePath("/projects");

    return actionSuccess(person.id);
  } catch (error) {
    return actionFailure(error, "Unable to create person.");
  }
}

export async function updatePersonAction(
  input: UpdatePersonInput,
): Promise<PersonMutationActionResult> {
  try {
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

    return actionSuccess(person.id);
  } catch (error) {
    return actionFailure(error, "Unable to update person.");
  }
}

export async function removePersonAction(
  input: RemovePersonInput,
): Promise<PersonMutationActionResult> {
  try {
    const viewerContext = await getViewerRequestContext();
    const person = await removePerson(input, viewerContext);

    invalidatePeopleReadCaches();
    invalidateProjectReadCaches();
    revalidateTag(getPeopleTag());
    revalidateTag(getPeopleOptionsTag());
    revalidateTag(getProjectsTag());
    revalidatePath("/people");
    revalidatePath(`/people/${person.id}`);
    revalidatePath("/projects");

    return actionSuccess(person.id);
  } catch (error) {
    return actionFailure(error, "Unable to remove person.");
  }
}

export async function resendPersonAccountEmailAction(
  input: ResendPersonAccountEmailInput,
): Promise<PersonAccountEmailActionResult> {
  try {
    const viewerContext = await getViewerRequestContext();
    const result = await resendPersonAccountEmail(input, viewerContext);

    return {
      error: null,
      message:
        result.delivery === "invite"
          ? `Invite email sent to ${result.email}.`
          : `Password email sent to ${result.email}.`,
      ok: true,
    };
  } catch (error) {
    return emailActionFailure(error, "Unable to resend the account email.");
  }
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
