import type { ReactNode } from "react";

interface PeopleLayoutProps {
  children: ReactNode;
  modal: ReactNode;
}

export default function PeopleLayout({ children, modal }: PeopleLayoutProps) {
  return (
    <div className="entity-route-shell">
      <div className="entity-route-content">{children}</div>
      {modal}
    </div>
  );
}
