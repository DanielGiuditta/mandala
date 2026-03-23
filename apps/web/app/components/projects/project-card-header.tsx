"use client";

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
          className="pd-icon-button"
          onClick={onAddClick}
          type="button"
        >
          +
        </button>
      ) : null}
    </div>
  );
}
