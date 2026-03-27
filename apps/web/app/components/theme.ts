export type AppTheme = "light" | "dark"

export const APP_THEME_STORAGE_KEY = "mandala.theme"

const DARK_THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)"

export function resolveStoredTheme(value: string | null): AppTheme | null {
  if (value === "light" || value === "dark") {
    return value
  }

  return null
}

export function getSystemTheme(): AppTheme {
  if (typeof window === "undefined") {
    return "light"
  }

  return window.matchMedia(DARK_THEME_MEDIA_QUERY).matches ? "dark" : "light"
}

export function getInitialTheme(): AppTheme {
  if (typeof document === "undefined") {
    return "light"
  }

  const root = document.documentElement
  const rootTheme = root.dataset.theme
  if (rootTheme === "light" || rootTheme === "dark") {
    return rootTheme
  }

  return getSystemTheme()
}

export function applyTheme(theme: AppTheme) {
  if (typeof document === "undefined") {
    return
  }

  const root = document.documentElement
  root.dataset.theme = theme
  root.style.colorScheme = theme
}

export function persistTheme(theme: AppTheme) {
  if (typeof window === "undefined") {
    return
  }

  window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme)
}

export function readStoredTheme(): AppTheme | null {
  if (typeof window === "undefined") {
    return null
  }

  return resolveStoredTheme(window.localStorage.getItem(APP_THEME_STORAGE_KEY))
}

export const THEME_INIT_SCRIPT = `
  (() => {
    const storageKey = ${JSON.stringify(APP_THEME_STORAGE_KEY)};
    const mediaQuery = ${JSON.stringify(DARK_THEME_MEDIA_QUERY)};
    try {
      const storedTheme = window.localStorage.getItem(storageKey);
      const resolvedTheme =
        storedTheme === "light" || storedTheme === "dark"
          ? storedTheme
          : window.matchMedia(mediaQuery).matches
            ? "dark"
            : "light";
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme;
    } catch {
      document.documentElement.dataset.theme = "light";
      document.documentElement.style.colorScheme = "light";
    }
  })();
`
