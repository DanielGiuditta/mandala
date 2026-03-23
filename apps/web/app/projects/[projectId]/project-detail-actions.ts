"use server";

import type {
  CreateProjectAssignmentInput,
  CreateProjectChecklistItemInput,
  CreateProjectDocumentInput,
  UpdateProjectChecklistItemInput,
  UpdateProjectTimeEntryInput,
} from "@mandala/db";
import {
  createProjectAssignment,
  createProjectChecklistItem,
  createProjectDocument,
  updateProjectChecklistItem,
  updateProjectTimeEntry,
} from "@mandala/db";
import { revalidatePath } from "next/cache";

import { getViewerRequestContext } from "../../../lib/auth/session";

export interface ProjectDetailActionResult {
  error: string | null;
  ok: boolean;
}

function actionFailure(error: unknown): ProjectDetailActionResult {
  return {
    error: error instanceof Error ? error.message : "Unable to save changes.",
    ok: false,
  };
}

function actionSuccess(projectId: string): ProjectDetailActionResult {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");

  return {
    error: null,
    ok: true,
  };
}

export async function addStaffAction(
  input: CreateProjectAssignmentInput,
): Promise<ProjectDetailActionResult> {
  try {
    const viewerContext = await getViewerRequestContext();
    await createProjectAssignment(input, viewerContext);
    return actionSuccess(input.projectId);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function addTaskAction(
  input: CreateProjectChecklistItemInput,
): Promise<ProjectDetailActionResult> {
  try {
    const viewerContext = await getViewerRequestContext();
    await createProjectChecklistItem(input, viewerContext);
    return actionSuccess(input.projectId);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function updateTaskAction(
  input: UpdateProjectChecklistItemInput,
): Promise<ProjectDetailActionResult> {
  try {
    const viewerContext = await getViewerRequestContext();
    await updateProjectChecklistItem(input, viewerContext);
    return actionSuccess(input.projectId);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function addResourceAction(
  input: CreateProjectDocumentInput,
): Promise<ProjectDetailActionResult> {
  try {
    const viewerContext = await getViewerRequestContext();
    await createProjectDocument(input, viewerContext);
    return actionSuccess(input.projectId);
  } catch (error) {
    return actionFailure(error);
  }
}

export async function editWorklogAction(
  input: UpdateProjectTimeEntryInput,
): Promise<ProjectDetailActionResult> {
  try {
    const viewerContext = await getViewerRequestContext();
    await updateProjectTimeEntry(input, viewerContext);
    return actionSuccess(input.projectId);
  } catch (error) {
    return actionFailure(error);
  }
}
