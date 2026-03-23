import type { CreateProjectInput } from "@mandala/db";
import type { ProjectStage } from "@mandala/domain";

export type CreateProjectFormInput = {
  name: string;
  clientName?: string | null;
  description?: string | null;
  officeId: string;
  leadPersonId?: string | null;
  stage: ProjectStage;
  startDate?: string | null;
  targetCompletionDate?: string | null;
  photoFile?: File | null;
  photoUrl?: string | null;
};

export type CreateProjectPayload = CreateProjectInput;

export interface ProjectCreateOfficeOption {
  id: string;
  name: string;
}

export interface ProjectCreateLeadOption {
  id: string;
  fullName: string;
}
