import { formatAnnualSalaryCompact } from "./people-list-formatters";
import {
  getFallbackAvatarColor,
  getFallbackAvatarInitial,
} from "../projects/project-avatar-utils";

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

export function formatInrMetric(value: number): string {
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

export function Avatar({
  label,
  photoUrl,
  size = "sm",
  fallbackKey,
}: {
  fallbackKey: string;
  label: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClass =
    size === "lg" ? "pd-avatar pd-avatar-lg" : size === "md" ? "pd-avatar pd-avatar-md" : "pd-avatar";

  if (photoUrl) {
    return <img alt="" aria-hidden className={sizeClass} loading="lazy" src={photoUrl} />;
  }

  return (
    <span
      aria-hidden
      className={`${sizeClass} pd-avatar-fallback`}
      style={{ backgroundColor: getFallbackAvatarColor(label, fallbackKey) }}
    >
      {getFallbackAvatarInitial(label, "?")}
    </span>
  );
}
