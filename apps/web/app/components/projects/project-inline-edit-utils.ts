import type { ProjectListItem, UpdateProjectInput } from "@mandala/db";

export function buildProjectUpdateInput(
  project: ProjectListItem,
  overrides: Partial<UpdateProjectInput> = {},
): UpdateProjectInput {
  return {
    clientName: project.clientName ?? null,
    description: project.description ?? null,
    leadPersonId: project.leadPersonId ?? null,
    managingOfficeId: project.managingOfficeId,
    name: project.name,
    originatingOfficeId: project.originatingOfficeId,
    photoUrl: project.photoUrl ?? null,
    projectId: project.id,
    stage: project.stage,
    startDate: project.startDate ?? null,
    targetCompletionDate: project.targetCompletionDate ?? null,
    ...overrides,
  };
}
