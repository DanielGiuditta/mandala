"use client";

import { type ReactNode, useEffect } from "react";
import { useRouter } from "next/navigation";

import {
  getEntityReturnUrl,
  type EntityReturnScope,
} from "./entity-return-url";

interface EntityReturnButtonProps {
  ariaLabel?: string;
  className?: string;
  fallbackHref: string;
  icon?: ReactNode;
  iconSrc?: string;
  label?: string;
  preferBack?: boolean;
  scope: EntityReturnScope;
}

export function EntityReturnButton({
  ariaLabel,
  className,
  fallbackHref,
  icon,
  iconSrc,
  label,
  preferBack = false,
  scope,
}: EntityReturnButtonProps) {
  const router = useRouter();
  const returnUrl = getEntityReturnUrl(scope) ?? fallbackHref;

  useEffect(() => {
    router.prefetch(returnUrl);
  }, [returnUrl, router]);

  function handleClick() {
    if (preferBack) {
      router.back();
      return;
    }

    router.replace(returnUrl);
  }

  return (
    <button
      aria-label={ariaLabel ?? label}
      className={className}
      onClick={handleClick}
      type="button"
    >
      {icon ? icon : null}
      {!icon && iconSrc ? (
        <img
          alt=""
          aria-hidden
          className="app-close-button-icon"
          src={iconSrc}
        />
      ) : null}
      {label ? <span>{label}</span> : null}
    </button>
  );
}
