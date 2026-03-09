export interface TimeEntry {
  id: string
  personId: string
  projectId: string
  assignmentId?: string | null
  date: string
  hours: number
  notes?: string | null
  source?: string | null
}

export function deriveLaborCost(hours: number, hourlyCost: number): number {
  return hours * hourlyCost
}
