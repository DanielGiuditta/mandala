import type { ReactNode } from "react";

interface EntityModalProps {
  children: ReactNode;
  panelClassName?: string;
}

export function EntityModal({
  children,
  panelClassName,
}: EntityModalProps) {
  return (
    <div className="entity-modal">
      <div className="entity-modal-backdrop" />
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
