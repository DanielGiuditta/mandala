import type { PersonListItem, UpdatePersonInput } from "@mandala/db";

type InlineEditablePerson = Pick<
  PersonListItem,
  | "annualSalary"
  | "effectivePermission"
  | "email"
  | "fullName"
  | "id"
  | "officeId"
  | "photoUrl"
  | "supervisorPersonId"
  | "title"
>;

export function buildPersonUpdateInput(
  person: InlineEditablePerson,
  overrides: Partial<UpdatePersonInput> = {},
): UpdatePersonInput {
  return {
    annualSalary: person.annualSalary,
    email: person.email ?? null,
    fullName: person.fullName,
    officeId: person.officeId,
    permission: person.effectivePermission,
    personId: person.id,
    photoUrl: person.photoUrl ?? null,
    supervisorPersonId: person.supervisorPersonId ?? null,
    title: person.title ?? null,
    ...overrides,
  };
}
