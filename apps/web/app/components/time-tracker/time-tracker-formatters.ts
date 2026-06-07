import { formatInrCompact } from "../currency-formatters";

export function formatTrackerCurrency(value: number | null): string {
  if (value === null) {
    return "Restricted";
  }

  return formatInrCompact(value);
}

export function formatTrackerHours(value: number): string {
  return value.toFixed(1);
}
