"use client";

import { EntityReturnButton } from "../entity-return-button";

export function ProjectDetailCloseButton() {
  return (
    <EntityReturnButton
      aria-label="Close and return to projects"
      className="entity-header-close-button"
      fallbackHref="/projects"
      iconSrc="/figma/nav/close-icon.svg"
      scope="projects"
    />
  );
}
