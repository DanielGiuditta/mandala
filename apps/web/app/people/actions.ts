"use server";

import type { CreatePersonInput } from "@mandala/db";
import {
  createPerson,
  invalidatePeopleReadCaches,
} from "@mandala/db";
import { revalidatePath, revalidateTag } from "next/cache";

import { getViewerRequestContext } from "../../lib/auth/session";
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
  revalidateTag(getPeopleTag());
  revalidateTag(getPeopleOptionsTag());
  revalidatePath("/people");

  return { personId: person.id };
}

export async function loadPeopleOptionsAction(): Promise<{
  forbidden: boolean;
  people: Array<{ fullName: string; id: string }>;
}> {
  const viewerContext = await getViewerRequestContext();
  return getCachedPeopleOptions(viewerContext);
}
