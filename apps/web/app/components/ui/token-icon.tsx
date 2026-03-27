import type { CSSProperties } from "react";

interface TokenIconProps {
  className?: string;
  src: string;
}

export function TokenIcon({ className, src }: TokenIconProps) {
  const style = {
    "--token-icon-src": `url("${src}")`,
  } as CSSProperties;

  return (
    <span
      aria-hidden
      className={className ? `token-icon ${className}` : "token-icon"}
      style={style}
    />
  );
}
