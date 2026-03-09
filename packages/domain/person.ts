export interface Person {
  id: string
  fullName: string
  title?: string | null
  officeId: string
  annualSalary: number
  availabilityHoursPerWeek: number
  email?: string | null
  active: boolean
}

export function deriveHourlyCost(annualSalary: number): number {
  return annualSalary / 2080
}

export function deriveAssignedHours(assignedHoursPerWeek: number[]): number {
  return assignedHoursPerWeek.reduce((total, hours) => total + hours, 0)
}

export function deriveRemainingCapacity(
  availabilityHoursPerWeek: number,
  assignedHours: number,
): number {
  return availabilityHoursPerWeek - assignedHours
}

export function derivePersonAllocationPercent(
  assignedHours: number,
  availabilityHoursPerWeek: number,
): number {
  if (availabilityHoursPerWeek <= 0) return 0
  return assignedHours / availabilityHoursPerWeek
}

export function deriveUtilizationPercent(
  loggedHoursInPeriod: number,
  availableHoursInPeriod: number,
): number {
  if (availableHoursInPeriod <= 0) return 0
  return loggedHoursInPeriod / availableHoursInPeriod
}
