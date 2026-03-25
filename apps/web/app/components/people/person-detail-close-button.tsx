"use client";

import { EntityReturnButton } from "../entity-return-button";
import { CloseButtonIcon } from "../close-button-icon";

export function PersonDetailCloseButton({
  preferBack = false,
}: {
  preferBack?: boolean;
}) {
  return (
    <EntityReturnButton
      ariaLabel="Close and return to people"
      className="app-close-button"
      fallbackHref="/people"
      icon={<CloseButtonIcon />}
      preferBack={preferBack}
      scope="people"
    />
  );
}
