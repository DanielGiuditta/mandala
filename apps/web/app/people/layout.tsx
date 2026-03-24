import type { ReactNode } from "react";

interface PeopleLayoutProps {
  children: ReactNode;
  modal: ReactNode;
}

export default function PeopleLayout({ children, modal }: PeopleLayoutProps) {
  return (
    <div className="entity-route-shell">
      {children}
      {modal}
    </div>
  );
}
