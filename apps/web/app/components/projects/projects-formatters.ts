import type { ProjectListItem } from "@mandala/db";

export function formatStageLabel(stage: string): string {
  if (stage === "onHold") {
    return "On hold";
  }

  return stage.charAt(0).toUpperCase() + stage.slice(1);
}

export function stageIcon(stage: ProjectListItem["stage"]): string {
  switch (stage) {
    case "proposal":
      return "✍️";
    case "planning":
      return "🏗️";
    case "construction":
      return "🏡";
    case "completed":
      return "💵";
    case "onHold":
      return "⏸️";
    case "active":
    default:
      return "💵";
  }
}

export function formatCurrency(value: number | null): string {
  if (value === null) {
    return "Restricted";
  }

  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 0,
    style: "currency",
  }).format(value);
}

export function formatHours(value: number | null): string {
  if (value === null) {
    return "Restricted";
  }

  return `${value.toFixed(1)}`;
}

export function formatLeadName(project: ProjectListItem): string {
  if (project.leadPersonName) {
    return project.leadPersonName;
  }

  return project.leadPersonId ? "Assigned lead" : "No lead";
}

export function formatOfficeRelationship(project: ProjectListItem): string {
  if (project.originatingOfficeName === project.managingOfficeName) {
    return project.managingOfficeName;
  }

  return `Origin: ${project.originatingOfficeName} · Managing: ${project.managingOfficeName}`;
}
