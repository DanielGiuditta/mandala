import { formatAnnualSalaryCompact } from "./people-list-formatters";

export { Avatar } from "../projects/project-detail-utils";

export function formatDate(value?: string | null): string {
  if (!value) {
    return "Not set";
  }

  const date = value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value);

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

export function formatHoursMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatHoursWithUnit(value: number): string {
  return `${formatHoursMetric(value)}h`;
}

export function formatInrMetric(value: number | null): string {
  if (value === null) {
    return "Restricted";
  }

  return formatAnnualSalaryCompact(value);
}

export function formatTimeSource(source?: string | null): string {
  if (source === "windows-tracker") {
    return "Windows checker";
  }

  if (source === "manual") {
    return "Manual";
  }

  return "Unknown source";
}
