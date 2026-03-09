export const PROJECT_STAGES = [
  "proposal",
  "planning",
  "active",
  "construction",
  "completed",
  "onHold",
] as const

export type ProjectStage = (typeof PROJECT_STAGES)[number]

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
