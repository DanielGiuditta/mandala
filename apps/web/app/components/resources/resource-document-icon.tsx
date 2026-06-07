interface ResourceDocumentIconProps {
  className?: string;
  fileType?: string | null;
}

function getDocumentMonogram(fileType?: string | null): string {
  const compactType = fileType?.replace(/[^a-z0-9]/gi, "").slice(0, 3);

  if (compactType) {
    return compactType.toUpperCase();
  }

  return "DOC";
}

export function ResourceDocumentIcon({
  className,
  fileType,
}: ResourceDocumentIconProps) {
  const iconClassName = className
    ? `resource-document-icon ${className}`
    : "resource-document-icon";

  return <span aria-hidden className={iconClassName}>{getDocumentMonogram(fileType)}</span>;
}
