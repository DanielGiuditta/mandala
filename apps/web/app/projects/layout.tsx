import type { ReactNode } from "react";

interface ProjectsLayoutProps {
  children: ReactNode;
  modal: ReactNode;
}

export default function ProjectsLayout({
  children,
  modal,
}: ProjectsLayoutProps) {
  return (
    <div className="entity-route-shell">
      <div className="entity-route-content">{children}</div>
      {modal}
    </div>
  );
}
