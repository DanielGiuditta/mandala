"use server";

import type {
  CreatePersonInput,
  ResendPersonAccountEmailInput,
  UpdatePersonInput,
} from "@mandala/db";
import {
  createPerson,
  invalidatePeopleReadCaches,
  invalidateProjectReadCaches,
  resendPersonAccountEmail,
  updatePerson,
} from "@mandala/db";
import { revalidatePath, revalidateTag } from "next/cache";

import { getViewerRequestContext } from "../../lib/auth/session";
import { getProjectsTag } from "../projects/data-cache";
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
  people: Array<{ fullName: string; id: string }>;
}> {
  const viewerContext = await getViewerRequestContext();
  return getCachedPeopleOptions(viewerContext);
}
