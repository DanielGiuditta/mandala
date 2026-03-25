interface EntityEditButtonProps {
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}

export function EntityEditButton({
  className,
  disabled = false,
  onClick,
  title,
}: EntityEditButtonProps) {
  return (
    <button
      aria-label="Edit"
      className={`app-close-button entity-edit-button${className ? ` ${className}` : ""}`}
      data-button-name="edit"
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      <svg
        aria-hidden
        className="app-close-button-icon"
        viewBox="0 0 24 24"
      >
        <path
          d="M15.77 3.3a2.06 2.06 0 0 1 2.92 0l2 2a2.06 2.06 0 0 1 0 2.92l-9.9 9.9a1 1 0 0 1-.43.25l-4 1.07a1 1 0 0 1-1.22-1.23l1.07-4a1 1 0 0 1 .25-.42l9.31-9.31Zm1.5 1.41L8.1 13.9l-.72 2.68 2.68-.72 9.22-9.22a.06.06 0 0 0 0-.09l-2-2a.06.06 0 0 0-.09 0Z"
          fill="currentColor"
        />
      </svg>
    </button>
  );
}
