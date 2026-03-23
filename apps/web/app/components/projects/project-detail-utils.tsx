import { getFallbackAvatarColor, getFallbackAvatarInitial } from "./project-avatar-utils";

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
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value);
}

export function formatHours(value: number): string {
  return `${value.toFixed(1)} h`;
}

export function formatHoursMetric(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

export function formatCostMetric(value: number): string {
  if (!Number.isFinite(value)) {
    return "$0";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
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

export function ProjectPhoto({
  name,
  projectId,
  photoUrl,
  size = "hero",
}: {
  name: string;
  photoUrl?: string | null;
  projectId: string;
  size?: "hero" | "thumb";
}) {
  const className = size === "thumb" ? "pd-project-thumb" : "pd-project-photo";

  if (photoUrl) {
    return <img alt="" aria-hidden className={className} loading="lazy" src={photoUrl} />;
  }

  return (
    <span
      aria-hidden
      className={`${className} pd-project-photo-fallback`}
      style={{ backgroundColor: getFallbackAvatarColor(name, projectId) }}
    >
      {getFallbackAvatarInitial(name, "P")}
    </span>
  );
}
