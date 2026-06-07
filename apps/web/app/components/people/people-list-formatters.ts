import type { PersonListItem } from "@mandala/db";

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value);
}

function formatCompactCrore(value: number): string {
  const crore = value / 10_000_000;
  return `₹${formatCompactNumber(crore)} Cr`;
}

function formatCompactLakh(value: number): string {
  const lakh = value / 100_000;
  return `₹${formatCompactNumber(lakh)} Lakh`;
}

export function formatAnnualSalaryCompact(value: number | null): string {
  if (value === null) {
    return "Restricted";
  }

  if (value >= 10_000_000) {
    return formatCompactCrore(value);
  }

  if (value >= 100_000) {
    return formatCompactLakh(value);
  }

  return new Intl.NumberFormat("en-IN", {
    currency: "INR",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function formatHoursThisWeek(value: number): string {
  return `${formatCompactNumber(value)}h`;
}

export function getInitialsFromName(value: string): string {
  const name = value.trim();

  if (!name) {
    return "P";
  }

  const parts = name.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  const first = parts[0]?.charAt(0) ?? "";
  const last = parts[parts.length - 1]?.charAt(0) ?? "";
  const initials = `${first}${last}`.toUpperCase();

  return initials || "P";
}

export function getPersonInitials(person: PersonListItem): string {
  return getInitialsFromName(person.fullName);
}
