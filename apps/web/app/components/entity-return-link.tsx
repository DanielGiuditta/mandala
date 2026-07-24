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
import { useEffect, useRef, useState } from "react";

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
  onMouseLeave?: (event: MouseEvent<HTMLAnchorElement>) => void;
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
  onMouseLeave,
  onTouchStart,
  prefetch = false,
  prefetchOnIntent = true,
  preserveCurrentSearch = true,
  scope,
  style,
}: EntityReturnLinkProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefetchTimeoutRef = useRef<number | null>(null);
  const [isPending, setIsPending] = useState(false);
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

  useEffect(() => {
    setIsPending(false);
  }, [pathname, currentSearch]);

  useEffect(() => {
    return () => {
      if (prefetchTimeoutRef.current !== null) {
        window.clearTimeout(prefetchTimeoutRef.current);
      }
    };
  }, []);

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

    if (
      !event.defaultPrevented &&
      event.button === 0 &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.shiftKey &&
      !event.altKey
    ) {
      setIsPending(true);
    }
  }

  function handleFocus(event: FocusEvent<HTMLAnchorElement>) {
    prefetchTarget();
    onFocus?.(event);
  }

  function handleMouseEnter(event: MouseEvent<HTMLAnchorElement>) {
    if (prefetchTimeoutRef.current !== null) {
      window.clearTimeout(prefetchTimeoutRef.current);
    }
    prefetchTimeoutRef.current = window.setTimeout(prefetchTarget, 120);
    onMouseEnter?.(event);
  }

  function handleMouseLeave(event: MouseEvent<HTMLAnchorElement>) {
    if (prefetchTimeoutRef.current !== null) {
      window.clearTimeout(prefetchTimeoutRef.current);
      prefetchTimeoutRef.current = null;
    }
    onMouseLeave?.(event);
  }

  function handleTouchStart(event: TouchEvent<HTMLAnchorElement>) {
    onTouchStart?.(event);
  }

  return (
    <Link
      aria-current={ariaCurrent}
      aria-busy={isPending || undefined}
      className={`${className ?? ""}${isPending ? " entity-navigation-pending" : ""}`}
      href={resolvedHref}
      onClick={handleClick}
      onFocus={handleFocus}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onTouchStart={handleTouchStart}
      prefetch={prefetch}
      style={style}
    >
      {children}
    </Link>
  );
}
