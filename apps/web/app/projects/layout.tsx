import type { ReactNode } from "react";

interface ProjectsLayoutProps {
  children: ReactNode;
  modal: ReactNode;
}

export default function ProjectsLayout({
  children,
  modal,
}: ProjectsLayoutProps) {
  const hasModal = modal !== null;

  return (
    <div className={`entity-route-shell${hasModal ? " entity-route-shell-modal-open" : ""}`}>
      <div
        aria-hidden={hasModal}
        className="entity-route-content"
      >
        {children}
      </div>
      {modal}
    </div>
  );
}
