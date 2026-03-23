"use client";

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
      <img
        alt=""
        aria-hidden
        className="projects-add-icon"
        src="/figma/projects/add-icon.svg"
      />
    </button>
  );
}
