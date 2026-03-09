export interface Assignment {
  id: string
  projectId: string
  personId: string
  assignedHoursPerWeek: number
  startDate?: string | null
  endDate?: string | null
  notes?: string | null
  active: boolean
}

export function deriveAllocationPercent(
  assignedHoursPerWeek: number,
  availabilityHoursPerWeek: number,
): number {
  if (availabilityHoursPerWeek <= 0) return 0
  return assignedHoursPerWeek / availabilityHoursPerWeek
}
