import type { ReactNode } from "react";

interface EntityHeaderProps {
  action?: ReactNode;
  className?: string;
  media?: ReactNode;
  title: string;
  titleAs?: "h1" | "h2" | "h3";
}

export function EntityHeader({
  action,
  className,
  media,
  title,
  titleAs = "h2",
}: EntityHeaderProps) {
  const TitleTag = titleAs;

  return (
    <header className={`entity-header${className ? ` ${className}` : ""}`}>
      <div className="entity-header-leading">
        {media ? <div className="entity-header-media">{media}</div> : null}
        <div className="entity-header-title-wrap">
          <TitleTag className="entity-header-title">{title}</TitleTag>
        </div>
      </div>
      {action ? <div className="entity-header-action">{action}</div> : null}
    </header>
  );
}
