import type { ProjectStage } from "@mandala/domain";

import type {
  CreateProjectFormInput,
  CreateProjectPayload,
} from "./project-create-types";
import {
  getFallbackAvatarInitial,
  getProjectFallbackAvatarStyle,
} from "./project-avatar-utils";

export const PROJECT_CREATE_STAGE_OPTIONS: readonly ProjectStage[] = [
  "proposal",
  "planning",
  "active",
  "construction",
  "completed",
  "onHold",
] as const;

function toNullableTrimmedText(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function formatProjectStageLabel(stage: ProjectStage): string {
  if (stage === "onHold") {
    return "On hold";
  }

  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

export function mapCreateProjectPayload(
  input: CreateProjectFormInput,
): CreateProjectPayload {
  const name = input.name.trim();

  return {
    clientName: toNullableTrimmedText(input.clientName),
    description: toNullableTrimmedText(input.description),
    leadPersonId: toNullableTrimmedText(input.leadPersonId),
    managingOfficeId: input.officeId,
    name,
    originatingOfficeId: input.officeId,
    photoUrl: toNullableTrimmedText(input.photoUrl),
    stage: input.stage,
    startDate: input.startDate ?? null,
    targetCompletionDate: input.targetCompletionDate ?? null,
  };
}

export function getProjectFallbackInitial(name: string): string {
  return getFallbackAvatarInitial(name, "P");
}

export function getProjectFallbackStyle(name: string) {
  return getProjectFallbackAvatarStyle(name, "project");
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = reader.result;

      if (typeof result === "string") {
        resolve(result);
        return;
      }

      reject(new Error("Unable to read the selected photo."));
    };

    reader.onerror = () => {
      reject(new Error("Unable to read the selected photo."));
    };

    reader.readAsDataURL(file);
  });
}
