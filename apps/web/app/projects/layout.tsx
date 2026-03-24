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
      {children}
      {modal}
    </div>
  );
}
