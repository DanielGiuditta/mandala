export const PROJECT_STAGES = [
  "proposal",
  "planning",
  "active",
  "construction",
  "completed",
  "onHold",
] as const

export type ProjectStage = (typeof PROJECT_STAGES)[number]

export function isProjectStage(value: string): value is ProjectStage {
  return (PROJECT_STAGES as readonly string[]).includes(value)
}

export interface Project {
  id: string
  name: string
  clientName?: string | null
  description?: string | null
  originatingOfficeId: string
  managingOfficeId: string
  leadPersonId?: string | null
  stage: ProjectStage
  startDate?: string | null
  targetCompletionDate?: string | null
  active: boolean
}
