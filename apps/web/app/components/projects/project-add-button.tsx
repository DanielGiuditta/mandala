"use client";

import { TokenIcon } from "../ui/token-icon";

interface ProjectAddButtonProps {
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}

export function ProjectAddButton({
  className,
  disabled = false,
  onClick,
  title,
}: ProjectAddButtonProps) {
  return (
    <button
      aria-label="Add project"
      className={className ?? "projects-add-button"}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      <TokenIcon
        className="projects-add-icon"
        src="/figma/projects/add-icon.svg"
      />
    </button>
  );
}
