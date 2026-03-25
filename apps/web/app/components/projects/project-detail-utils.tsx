import {
  getFallbackAvatarInitial,
  getPersonFallbackAvatarStyle,
  getProjectFallbackAvatarStyle,
} from "./project-avatar-utils";
import { formatInrCompact } from "../currency-formatters";

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

export function formatShortDate(value?: string | null): string {
  if (!value) {
    return "Not set";
  }

  const date = value.length === 10 ? new Date(`${value}T12:00:00Z`) : new Date(value);
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = String(date.getUTCFullYear()).slice(-2);

  return `${day}/${month}/${year}`;
}

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}

export function formatCurrency(value: number): string {
  return formatInrCompact(value);
}

export function formatHours(value: number): string {
  return `${value.toFixed(1)} h`;
}

export function formatHoursMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatCostMetric(value: number): string {
  if (!Number.isFinite(value)) {
    return "₹0";
  }

  return formatInrCompact(value);
}

export function formatStageLabel(stage: string): string {
  if (stage === "onHold") {
    return "On hold";
  }

  return stage.charAt(0).toUpperCase() + stage.slice(1);
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
  variant = "person",
}: {
  fallbackKey: string;
  label: string;
  photoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  variant?: "person" | "project";
}) {
  const sizeClass =
    size === "lg" ? "pd-avatar pd-avatar-lg" : size === "md" ? "pd-avatar pd-avatar-md" : "pd-avatar";
  const fallbackStyle =
    variant === "project"
      ? getProjectFallbackAvatarStyle(label, fallbackKey)
      : getPersonFallbackAvatarStyle(label, fallbackKey);

  if (photoUrl) {
    return <img alt="" aria-hidden className={sizeClass} loading="lazy" src={photoUrl} />;
  }

  return (
    <span
      aria-hidden
      className={`${sizeClass} pd-avatar-fallback`}
      style={fallbackStyle}
    >
      {getFallbackAvatarInitial(label, "?")}
    </span>
  );
}

export function EntityPhoto({
  entityId,
  label,
  photoUrl,
  size = "hero",
  variant = "project",
}: {
  entityId: string;
  label: string;
  photoUrl?: string | null;
  size?: "hero" | "thumb";
  variant?: "person" | "project";
}) {
  const sizeClass =
    size === "thumb"
      ? "pd-entity-photo pd-entity-photo-thumb"
      : "pd-entity-photo pd-entity-photo-hero";
  const shapeClass =
    variant === "person"
      ? "pd-entity-photo-circle"
      : "pd-entity-photo-rounded";
  const fallbackStyle =
    variant === "project"
      ? getProjectFallbackAvatarStyle(label, entityId)
      : getPersonFallbackAvatarStyle(label, entityId);
  const className = `${sizeClass} ${shapeClass}`;

  if (photoUrl) {
    return <img alt="" aria-hidden className={className} loading="lazy" src={photoUrl} />;
  }

  return (
    <span
      aria-hidden
      className={`${className} pd-entity-photo-fallback`}
      style={fallbackStyle}
    >
      {getFallbackAvatarInitial(label, variant === "person" ? "?" : "P")}
    </span>
  );
}
