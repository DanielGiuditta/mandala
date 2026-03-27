"use client"

import { usePathname } from "next/navigation"
import { type ReactNode, useEffect, useState } from "react"

import { AppSidebar, type AppShellState } from "./app-sidebar"
import {
  type AppTheme,
  applyTheme,
  getInitialTheme,
  getSystemTheme,
  persistTheme,
  readStoredTheme,
} from "./theme"

interface AppFrameProps {
  children: ReactNode
  shell: AppShellState
}

export function AppFrame({ children, shell }: AppFrameProps) {
  const pathname = usePathname()
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme)
  const hideShell = pathname === "/login"

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")

    function handleSystemThemeChange() {
      if (readStoredTheme()) {
        return
      }

      setTheme(getSystemTheme())
    }

    mediaQuery.addEventListener("change", handleSystemThemeChange)

    return () => mediaQuery.removeEventListener("change", handleSystemThemeChange)
  }, [])

  function handleThemeToggle() {
    setTheme((currentTheme) => {
      const nextTheme: AppTheme = currentTheme === "dark" ? "light" : "dark"
      persistTheme(nextTheme)
      applyTheme(nextTheme)
      return nextTheme
    })
  }

  if (hideShell) {
    return children
  }

  return (
    <div className="app-shell app-shell-figma">
      <AppSidebar
        onThemeToggle={handleThemeToggle}
        shell={shell}
        theme={theme}
      />
      <div className="app-domain">
        {children}
      </div>
    </div>
  )
}
