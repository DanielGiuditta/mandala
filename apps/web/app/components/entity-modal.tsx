import type { ReactNode } from "react";

interface EntityModalProps {
  children: ReactNode;
  panelClassName?: string;
  showBackdrop?: boolean;
}

export function EntityModal({
  children,
  panelClassName,
  showBackdrop = true,
}: EntityModalProps) {
  return (
    <div className="entity-modal">
      {showBackdrop ? <div className="entity-modal-backdrop" /> : null}
      <div
        className={`entity-modal-panel${
          panelClassName ? ` ${panelClassName}` : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}
