"use client";

import { EntityReturnButton } from "../entity-return-button";
import { CloseButtonIcon } from "../close-button-icon";

export function ProjectDetailCloseButton({
  preferBack = false,
}: {
  preferBack?: boolean;
}) {
  return (
    <EntityReturnButton
      ariaLabel="Close and return to projects"
      className="app-close-button"
      fallbackHref="/projects"
      icon={<CloseButtonIcon />}
      preferBack={preferBack}
      scope="projects"
    />
  );
}
