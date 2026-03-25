"use server";

import type {
  GetSelfTimeTrackerDataInput,
  RecordSelfTimeTrackerEntryInput,
  RecordSelfTimeTrackerEntryResult,
  SelfTimeTrackerData,
} from "@mandala/db";
import {
  getSelfTimeTrackerData,
  invalidatePeopleReadCaches,
  invalidateProjectReadCaches,
  recordSelfTimeTrackerEntry,
} from "@mandala/db";
import { revalidatePath, revalidateTag } from "next/cache";

import { getViewerRequestContext } from "../../lib/auth/session";
import { getPeopleTag } from "../people/data-cache";
import { getProjectTag, getProjectsTag } from "../projects/data-cache";

export interface SelfTimeTrackerActionResult {
  entry: RecordSelfTimeTrackerEntryResult["entry"] | null;
  error: string | null;
  ok: boolean;
  todayHours: number | null;
}

export async function loadSelfTimeTrackerAction(
  input: GetSelfTimeTrackerDataInput,
): Promise<SelfTimeTrackerData> {
  const viewerContext = await getViewerRequestContext();
  return getSelfTimeTrackerData(input, viewerContext);
}

export async function recordSelfTimeTrackerEntryAction(
  input: RecordSelfTimeTrackerEntryInput,
): Promise<SelfTimeTrackerActionResult> {
  try {
    const viewerContext = await getViewerRequestContext();
    const result = await recordSelfTimeTrackerEntry(input, viewerContext);

    invalidateProjectReadCaches();
    invalidatePeopleReadCaches();
    revalidateTag(getProjectsTag());
    revalidateTag(getProjectTag(result.entry.projectId));
    revalidateTag(getPeopleTag());
    revalidatePath("/projects");
    revalidatePath(`/projects/${result.entry.projectId}`);
    revalidatePath("/people");
    revalidatePath(`/people/${result.entry.personId}`);

    return {
      entry: result.entry,
      error: null,
      ok: true,
      todayHours: result.todayHours,
    };
  } catch (error) {
    return {
      entry: null,
      error: error instanceof Error ? error.message : "Unable to save tracked time.",
      ok: false,
      todayHours: null,
    };
  }
}
