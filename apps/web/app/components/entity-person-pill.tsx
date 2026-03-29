"use client";

import type { ReactNode } from "react";

import { EntityReturnLink } from "./entity-return-link";
import { getInitialsFromName } from "./people/people-list-formatters";
import { getPersonFallbackAvatarStyle } from "./projects/project-avatar-utils";

export type EntityPersonPillProps =
  | {
      variant: "empty";
      actionLabel: string;
      readonlyLabel: string;
      toggleButton: ReactNode | null;
    }
  | {
      variant: "person";
      avatarFallbackKey: string;
      displayName: string;
      personId: string | null;
      photoUrl: string | null;
      toggleButton: ReactNode | null;
    };

/** Shared person chip for list rows (supervisor, project lead, etc.): same DOM + styles everywhere. */
export function EntityPersonPill(props: EntityPersonPillProps) {
  if (props.variant === "empty") {
    const { actionLabel, readonlyLabel, toggleButton } = props;

    if (toggleButton) {
      return (
        <span className="entity-person-pill">
          <span className="entity-person-pill-label">{actionLabel}</span>
          {toggleButton}
        </span>
      );
    }

    return <span className="entity-person-pill-muted">{readonlyLabel}</span>;
  }

  const { avatarFallbackKey, displayName, personId, photoUrl, toggleButton } = props;
  const initials = getInitialsFromName(displayName);

  const body = (
    <>
      {photoUrl ? (
        <img
          alt=""
          aria-hidden
          className="entity-person-pill-avatar"
          loading="lazy"
          src={photoUrl}
        />
      ) : (
        <span
          aria-hidden
          className="entity-person-pill-fallback"
          style={getPersonFallbackAvatarStyle(displayName, avatarFallbackKey)}
        >
          {initials}
        </span>
      )}
      <span className="entity-person-pill-label entity-content-link-label">{displayName}</span>
    </>
  );

  return (
    <span className="entity-person-pill">
      {personId ? (
        <EntityReturnLink
          className="entity-content-link entity-content-link-grow"
          href={`/people/${personId}`}
          scope="people"
        >
          {body}
        </EntityReturnLink>
      ) : (
        body
      )}
      {toggleButton}
    </span>
  );
}
