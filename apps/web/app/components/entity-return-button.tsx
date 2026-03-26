"use client";

import { type ReactNode } from "react";

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
  scope: EntityReturnScope;
}

export function EntityReturnButton({
  ariaLabel,
  className,
  fallbackHref,
  icon,
  iconSrc,
  label,
  scope,
}: EntityReturnButtonProps) {
  const returnUrl = getEntityReturnUrl(scope) ?? fallbackHref;

  function handleClick() {
    window.location.replace(returnUrl);
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
