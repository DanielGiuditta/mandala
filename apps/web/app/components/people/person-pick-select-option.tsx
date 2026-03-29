"use client";

import { getPersonFallbackAvatarStyle } from "../projects/project-avatar-utils";
import type { SelectDropdownOption } from "../ui/dropdown";
import { getInitialsFromName } from "./people-list-formatters";

export type PersonPickRowInput = {
  fullName: string;
  id: string;
  photoUrl: string | null;
  title: string | null;
};

/** Figma People menu row (e.g. supervisor picker): circular thumb, name, title line. */
export function personPickToSelectOption(person: PersonPickRowInput): SelectDropdownOption {
  const meta = person.title?.trim();

  return {
    description: meta || undefined,
    label: person.fullName,
    leadingVisual: person.photoUrl ? (
      <img
        alt=""
        aria-hidden
        className="dropdown-person-pick-avatar"
        loading="lazy"
        src={person.photoUrl}
      />
    ) : (
      <span
        aria-hidden
        className="dropdown-person-pick-fallback"
        style={getPersonFallbackAvatarStyle(person.fullName, person.id)}
      >
        {getInitialsFromName(person.fullName)}
      </span>
    ),
    leadingVisualShape: "circle",
    value: person.id,
  };
}
