import type { CreatePersonPermission } from "@mandala/db";

import {
  getFallbackAvatarInitial,
  getPersonFallbackAvatarStyle,
} from "../projects/project-avatar-utils";
import type {
  PersonCreateFormInput,
  PersonCreatePayload,
} from "./person-create-types";

export const PERSON_CREATE_PERMISSION_OPTIONS: ReadonlyArray<{
  label: string;
  value: CreatePersonPermission;
}> = [
  { label: "No account", value: "noAccount" },
  { label: "Employee", value: "employee" },
  { label: "Admin", value: "admin" },
  { label: "Partner", value: "partner" },
] as const;

function toNullableTrimmedText(
  value: string | null | undefined,
): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export function formatCreatePersonPermissionLabel(
  permission: CreatePersonPermission,
): string {
  const option = PERSON_CREATE_PERMISSION_OPTIONS.find(
    (item) => item.value === permission,
  );

  return option?.label ?? permission;
}

export function mapCreatePersonPayload(
  input: PersonCreateFormInput,
): PersonCreatePayload {
  return {
    annualSalary: Number(input.annualSalary),
    email: toNullableTrimmedText(input.email),
    fullName: input.fullName.trim(),
    officeId: input.officeId,
    permission: input.permission,
    photoUrl: toNullableTrimmedText(input.photoUrl),
    supervisorPersonId: toNullableTrimmedText(input.supervisorPersonId),
    title: toNullableTrimmedText(input.title),
  };
}

export function getPersonCreateFallbackInitial(name: string): string {
  return getFallbackAvatarInitial(name, "P");
}

export function getPersonCreateFallbackStyle(name: string) {
  return getPersonFallbackAvatarStyle(name, "person-create");
}
