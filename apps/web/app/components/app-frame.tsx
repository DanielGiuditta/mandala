"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { AppSidebar, type AppShellState } from "./app-sidebar"

interface AppFrameProps {
  children: ReactNode
  shell: AppShellState
}

export function AppFrame({ children, shell }: AppFrameProps) {
  const pathname = usePathname()
  const hideShell = pathname === "/login"
  const isProjectDetailRoute =
    pathname.startsWith("/projects/") && pathname !== "/projects"

  if (hideShell) {
    return children
  }

  return (
    <div className="app-shell app-shell-figma">
      <AppSidebar shell={shell} />
      <div className={`app-domain ${isProjectDetailRoute ? "app-domain-detail" : ""}`}>
        {children}
      </div>
    </div>
  )
}
