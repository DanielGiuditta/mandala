"use client";

import { EntityReturnButton } from "../entity-return-button";

export function ProjectDetailCloseButton({
  preferBack = false,
}: {
  preferBack?: boolean;
}) {
  return (
    <EntityReturnButton
      aria-label="Close and return to projects"
      className="entity-header-close-button"
      fallbackHref="/projects"
      iconSrc="/figma/nav/close-icon.svg"
      preferBack={preferBack}
      scope="projects"
    />
  );
}
