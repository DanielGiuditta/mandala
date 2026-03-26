"use client";

import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";

import {
  rememberEntityReturnUrl,
  type EntityReturnScope,
} from "./entity-return-url";

interface EntityReturnLinkProps {
  ariaCurrent?: "page";
  children: ReactNode;
  className?: string;
  href: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
  prefetch?: boolean;
  scope: EntityReturnScope;
}

export function EntityReturnLink({
  ariaCurrent,
  children,
  className,
  href,
  onClick,
  prefetch = false,
  scope,
}: EntityReturnLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    rememberEntityReturnUrl(
      scope,
      `${window.location.pathname}${window.location.search}`,
    );
    onClick?.(event);
  }

  return (
    <Link
      aria-current={ariaCurrent}
      className={className}
      href={href}
      onClick={handleClick}
      prefetch={prefetch}
    >
      {children}
    </Link>
  );
}
