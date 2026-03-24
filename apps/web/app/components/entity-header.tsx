import type { ReactNode } from "react";

interface EntityHeaderProps {
  action?: ReactNode;
  className?: string;
  media?: ReactNode;
  title: string;
}

export function EntityHeader({
  action,
  className,
  media,
  title,
}: EntityHeaderProps) {
  return (
    <header className={`entity-header${className ? ` ${className}` : ""}`}>
      <div className="entity-header-leading">
        {media ? <div className="entity-header-media">{media}</div> : null}
        <div className="entity-header-title-wrap">
          <h2 className="entity-header-title">{title}</h2>
        </div>
      </div>
      {action ? <div className="entity-header-action">{action}</div> : null}
    </header>
  );
}
