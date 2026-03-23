const WARM_PASTEL_COLORS = [
  "#f6dfd1",
  "#f8e5cf",
  "#f3e3bc",
  "#e6ebc5",
  "#d8e9d3",
  "#d6e8e7",
  "#dce3f3",
  "#e8ddf4",
  "#f1dcf0",
] as const;

export function getFallbackAvatarInitial(
  value: string,
  fallback = "P",
): string {
  const trimmed = value.trim();

  if (!trimmed) {
    return fallback;
  }

  return trimmed.charAt(0).toUpperCase();
}

export function getFallbackAvatarColor(
  value: string,
  fallbackKey = "fallback",
): string {
  const normalized = value.trim().toLowerCase() || fallbackKey;
  const hash = Array.from(normalized).reduce(
    (accumulator, char) => accumulator + char.charCodeAt(0),
    0,
  );

  return WARM_PASTEL_COLORS[hash % WARM_PASTEL_COLORS.length];
}
