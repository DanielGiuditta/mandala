type AvatarGradient = {
  end: string;
  start: string;
};

const WARM_PASTEL_GRADIENTS: readonly AvatarGradient[] = [
  { end: "#f2c8b6", start: "#fae5dc" },
  { end: "#f4cfb5", start: "#fbe6d6" },
  { end: "#f0d7ab", start: "#f8ebca" },
  { end: "#efc3b5", start: "#f7ddd2" },
  { end: "#ecc1c5", start: "#f7dde0" },
  { end: "#eed2b0", start: "#f8e5ce" },
] as const;

const COOL_PASTEL_GRADIENTS: readonly AvatarGradient[] = [
  { end: "#bfdcf1", start: "#dceffa" },
  { end: "#c4e6df", start: "#ddf4ef" },
  { end: "#c7daf5", start: "#dfe9fb" },
  { end: "#c2e1ee", start: "#d9eff7" },
  { end: "#cfd8f0", start: "#e5ebf8" },
  { end: "#d1d8ef", start: "#e8ebf8" },
] as const;

const PERSON_FALLBACK_TEXT_COLOR = "#5b3524";
const PROJECT_FALLBACK_TEXT_COLOR = "#25465a";
const LEGACY_FALLBACK_COLORS = [
  ...WARM_PASTEL_GRADIENTS.map((gradient) => gradient.start),
  ...COOL_PASTEL_GRADIENTS.map((gradient) => gradient.start),
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
  const hash = getFallbackAvatarHash(value, fallbackKey);

  return LEGACY_FALLBACK_COLORS[hash % LEGACY_FALLBACK_COLORS.length];
}

function getFallbackAvatarHash(
  value: string,
  fallbackKey = "fallback",
): number {
  const normalized = value.trim().toLowerCase() || fallbackKey;

  return Array.from(normalized).reduce(
    (accumulator, char) => accumulator + char.charCodeAt(0),
    0,
  );
}

function getFallbackAvatarStyle(
  value: string,
  fallbackKey: string,
  gradients: readonly AvatarGradient[],
  textColor: string,
) {
  const hash = getFallbackAvatarHash(value, fallbackKey);
  const gradient = gradients[hash % gradients.length];

  return {
    background: `linear-gradient(180deg, ${gradient.start} 0%, ${gradient.end} 100%)`,
    color: textColor,
  };
}

export function getPersonFallbackAvatarStyle(
  value: string,
  fallbackKey = "fallback",
) {
  return getFallbackAvatarStyle(
    value,
    fallbackKey,
    WARM_PASTEL_GRADIENTS,
    PERSON_FALLBACK_TEXT_COLOR,
  );
}

export function getProjectFallbackAvatarStyle(
  value: string,
  fallbackKey = "fallback",
) {
  return getFallbackAvatarStyle(
    value,
    fallbackKey,
    COOL_PASTEL_GRADIENTS,
    PROJECT_FALLBACK_TEXT_COLOR,
  );
}
