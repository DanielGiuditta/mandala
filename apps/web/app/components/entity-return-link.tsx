"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type {
  CSSProperties,
  FocusEvent,
  MouseEvent,
  ReactNode,
  TouchEvent,
} from "react";

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
  onFocus?: (event: FocusEvent<HTMLAnchorElement>) => void;
  onMouseEnter?: (event: MouseEvent<HTMLAnchorElement>) => void;
  onTouchStart?: (event: TouchEvent<HTMLAnchorElement>) => void;
  prefetch?: boolean | "auto" | null;
  prefetchOnIntent?: boolean;
  preserveCurrentSearch?: boolean;
  scope: EntityReturnScope;
  style?: CSSProperties;
}

function getListPath(scope: EntityReturnScope): string {
  return scope === "people" ? "/people" : "/projects";
}

export function EntityReturnLink({
  ariaCurrent,
  children,
  className,
  href,
  onClick,
  onFocus,
  onMouseEnter,
  onTouchStart,
  prefetch = "auto",
  prefetchOnIntent = true,
  preserveCurrentSearch = true,
  scope,
  style,
}: EntityReturnLinkProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const listPath = getListPath(scope);
  const currentSearch = searchParams.toString();
  const shouldPreserveCurrentSearch =
    preserveCurrentSearch &&
    Boolean(currentSearch) &&
    !href.includes("?") &&
    (pathname === listPath || pathname.startsWith(`${listPath}/`));
  const resolvedHref = shouldPreserveCurrentSearch
    ? `${href}?${currentSearch}`
    : href;

  function prefetchTarget() {
    if (!prefetchOnIntent) {
      return;
    }

    router.prefetch(resolvedHref);
  }

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    rememberEntityReturnUrl(
      scope,
      `${window.location.pathname}${window.location.search}`,
    );
    onClick?.(event);
  }

  function handleFocus(event: FocusEvent<HTMLAnchorElement>) {
    prefetchTarget();
    onFocus?.(event);
  }

  function handleMouseEnter(event: MouseEvent<HTMLAnchorElement>) {
    prefetchTarget();
    onMouseEnter?.(event);
  }

  function handleTouchStart(event: TouchEvent<HTMLAnchorElement>) {
    prefetchTarget();
    onTouchStart?.(event);
  }

  return (
    <Link
      aria-current={ariaCurrent}
      className={className}
      href={resolvedHref}
      onClick={handleClick}
      onFocus={handleFocus}
      onMouseEnter={handleMouseEnter}
      onTouchStart={handleTouchStart}
      prefetch={prefetch}
      style={style}
    >
      {children}
    </Link>
  );
}
