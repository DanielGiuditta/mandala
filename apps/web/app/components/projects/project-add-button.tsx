"use client";

import { TokenIcon } from "../ui/token-icon";

interface ProjectAddButtonProps {
  className?: string;
  onClick?: () => void;
}

export function ProjectAddButton({ className, onClick }: ProjectAddButtonProps) {
  return (
    <button
      aria-label="Add project"
      className={className ?? "projects-add-button"}
      onClick={onClick}
      type="button"
    >
      <TokenIcon
        className="projects-add-icon"
        src="/figma/projects/add-icon.svg"
      />
    </button>
  );
}
