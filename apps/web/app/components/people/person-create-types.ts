import type {
  CreatePersonInput,
  CreatePersonPermission,
} from "@mandala/db";

export type PersonCreateMode = "create" | "edit";

export type PersonCreateFormInput = {
  annualSalary: string;
  email: string;
  fullName: string;
  officeId: string;
  permission: CreatePersonPermission;
  photoFile: File | null;
  photoUrl: string | null;
  supervisorPersonId: string;
  title: string;
};

export type PersonCreatePayload = CreatePersonInput;

export interface PersonCreateOfficeOption {
  id: string;
  name: string;
}

export interface PersonCreateSupervisorOption {
  id: string;
  fullName: string;
}
