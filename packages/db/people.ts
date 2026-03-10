import type { Person } from "@mandala/domain"
import {
  deriveAssignedHours,
  deriveHourlyCost,
  derivePersonAllocationPercent,
  deriveRemainingCapacity,
} from "@mandala/domain"

import { fetchOfficeRows, type OfficeRow, type PersonRow } from "./lookups"
import { createServerSupabaseClient, getDatabaseStatus } from "./supabaseServer"

interface AssignmentRow {
  person_id: string
  assigned_hours_per_week: number | string
  active: boolean
}

export interface PeopleOfficeFilter {
  id: string
  name: string
}

export interface PeopleListFilters {
  officeId?: string
  query?: string
}

export interface PersonListItem extends Person {
  allocationPercent: number
  assignedHours: number
  hourlyCost: number
  officeName: string
  remainingCapacity: number
}

export interface PeopleListData {
  configMessage: string | null
  configured: boolean
  filters: PeopleListFilters
  offices: PeopleOfficeFilter[]
  people: PersonListItem[]
}

function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    fullName: row.full_name,
    title: row.title,
    officeId: row.office_id,
    annualSalary: Number(row.annual_salary),
    availabilityHoursPerWeek: Number(row.availability_hours_per_week),
    email: row.email,
    active: row.active,
  }
}

function matchesFilters(row: PersonRow, filters: PeopleListFilters): boolean {
  const query = filters.query?.trim().toLowerCase()

  if (filters.officeId && row.office_id !== filters.officeId) {
    return false
  }

  if (query) {
    const haystacks = [row.full_name, row.title ?? "", row.email ?? ""]
    return haystacks.some((value) => value.toLowerCase().includes(query))
  }

  return true
}

function buildPersonListItem(
  row: PersonRow,
  assignmentsByPersonId: Map<string, number>,
  officesById: Map<string, OfficeRow>,
): PersonListItem {
  const person = toPerson(row)
  const assignedHours = deriveAssignedHours([assignmentsByPersonId.get(row.id) ?? 0])

  return {
    ...person,
    allocationPercent: derivePersonAllocationPercent(
      assignedHours,
      person.availabilityHoursPerWeek,
    ),
    assignedHours,
    hourlyCost: deriveHourlyCost(person.annualSalary),
    officeName: officesById.get(person.officeId)?.name ?? "Unknown office",
    remainingCapacity: deriveRemainingCapacity(
      person.availabilityHoursPerWeek,
      assignedHours,
    ),
  }
}

export async function listPeople(filters: PeopleListFilters = {}): Promise<PeopleListData> {
  const status = getDatabaseStatus()
  const client = createServerSupabaseClient()

  if (!client) {
    return {
      configMessage: status.message,
      configured: status.configured,
      filters,
      offices: [],
      people: [],
    }
  }

  const [{ data: peopleData, error: peopleError }, offices] = await Promise.all([
    client
      .from("people")
      .select(
        "id, full_name, title, office_id, annual_salary, availability_hours_per_week, email, active",
      )
      .order("full_name"),
    fetchOfficeRows(),
  ])

  if (peopleError) {
    throw peopleError
  }

  const filteredPeople = ((peopleData ?? []) as PersonRow[]).filter((row) =>
    matchesFilters(row, filters),
  )
  const peopleIds = filteredPeople.map((person) => person.id)
  const officesById = new Map(offices.map((office) => [office.id, office]))

  let assignmentsByPersonId = new Map<string, number>()

  if (peopleIds.length > 0) {
    const { data: assignmentData, error: assignmentError } = await client
      .from("assignments")
      .select("person_id, assigned_hours_per_week, active")
      .in("person_id", peopleIds)
      .eq("active", true)

    if (assignmentError) {
      throw assignmentError
    }

    assignmentsByPersonId = ((assignmentData ?? []) as AssignmentRow[]).reduce(
      (totals, assignment) => {
        const currentTotal = totals.get(assignment.person_id) ?? 0
        totals.set(
          assignment.person_id,
          currentTotal + Number(assignment.assigned_hours_per_week),
        )
        return totals
      },
      new Map<string, number>(),
    )
  }

  return {
    configMessage: status.message,
    configured: status.configured,
    filters,
    offices: offices.map((office) => ({ id: office.id, name: office.name })),
    people: filteredPeople.map((row) =>
      buildPersonListItem(row, assignmentsByPersonId, officesById),
    ),
  }
}
