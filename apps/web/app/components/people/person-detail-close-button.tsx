"use client";

import { EntityReturnButton } from "../entity-return-button";

export function PersonDetailCloseButton({
  preferBack = false,
}: {
  preferBack?: boolean;
}) {
  return (
    <EntityReturnButton
      ariaLabel="Close and return to people"
      className="entity-header-close-button"
      fallbackHref="/people"
      iconSrc="/figma/nav/close-icon.svg"
      preferBack={preferBack}
      scope="people"
    />
  );
}
