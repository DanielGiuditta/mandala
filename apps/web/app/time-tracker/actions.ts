"use server";

import type {
  GetSelfTimeTrackerDataInput,
  SelfTimeTrackerData,
} from "@mandala/db";
import { getSelfTimeTrackerData } from "@mandala/db";

import { getViewerRequestContext } from "../../lib/auth/session";

export async function loadSelfTimeTrackerAction(
  input: GetSelfTimeTrackerDataInput,
): Promise<SelfTimeTrackerData> {
  try {
    const viewerContext = await getViewerRequestContext();
    return getSelfTimeTrackerData(input, viewerContext);
  } catch (error) {
    console.error("loadSelfTimeTrackerAction failed", error);

    return {
      activeSession: null,
      accessMessage:
        error instanceof Error
          ? error.message
          : "Unable to load time tracker.",
      configured: true,
      configMessage: null,
      forbidden: false,
      projects: [],
    };
  }
}
