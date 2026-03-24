export type EntityReturnScope = "people" | "projects";

function getStorageKey(scope: EntityReturnScope): string {
  return `kolam-return-url:${scope}`;
}

export function rememberEntityReturnUrl(
  scope: EntityReturnScope,
  url: string,
): void {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(getStorageKey(scope), url);
}

export function getEntityReturnUrl(
  scope: EntityReturnScope,
): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.sessionStorage.getItem(getStorageKey(scope));
}
