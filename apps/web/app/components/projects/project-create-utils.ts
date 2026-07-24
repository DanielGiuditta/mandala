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

interface PhotoOptimizationOptions {
  maxBytes?: number;
  maxDimension?: number;
}

function getDataUrlByteLength(dataUrl: string): number {
  const encoded = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.ceil((encoded.length * 3) / 4);
}

function loadPhoto(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Unable to read the selected photo."));
    };
    image.src = objectUrl;
  });
}

export async function readFileAsDataUrl(
  file: File,
  {
    maxBytes = 140 * 1024,
    maxDimension = 640,
  }: PhotoOptimizationOptions = {},
): Promise<string> {
  const image = await loadPhoto(file);
  let scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  let bestResult = "";

  for (let resizeAttempt = 0; resizeAttempt < 5; resizeAttempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Unable to prepare the selected photo.");
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (let quality = 0.82; quality >= 0.42; quality -= 0.1) {
      const result = canvas.toDataURL("image/webp", quality);
      bestResult = result;

      if (getDataUrlByteLength(result) <= maxBytes) {
        return result;
      }
    }

    scale *= 0.8;
  }

  return bestResult;
}
