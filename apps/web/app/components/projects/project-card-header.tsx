"use client";

import { TokenIcon } from "../ui/token-icon";

interface ProjectCardHeaderProps {
  addAriaLabel?: string;
  onAddClick?: () => void;
  title: string;
}

export function ProjectCardHeader({
  addAriaLabel,
  onAddClick,
  title,
}: ProjectCardHeaderProps) {
  return (
    <div className="pd-card-header">
      <h3 className="pd-card-title">{title}</h3>
      {onAddClick ? (
        <button
          aria-label={addAriaLabel}
          className="projects-add-button"
          onClick={onAddClick}
          type="button"
        >
          <TokenIcon
            className="projects-add-icon"
            src="/figma/projects/add-icon.svg"
          />
        </button>
      ) : null}
    </div>
  );
}
