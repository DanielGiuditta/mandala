"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import { signOutAction } from "../login/actions"
import { SidebarNav } from "../sidebar-nav"

export interface AppShellState {
  accessMessage: string | null
  configured: boolean
  displayName: string | null
  isAuthenticated: boolean
  officeName: string | null
  primaryTier: string | null
  sessionEmail: string | null
}

const NAV_FORCE_COLLAPSE_WIDTH = 800

function BrandMark() {
  return (
    <img
      alt=""
      aria-hidden
      className="app-logo-icon app-logo-icon-open"
      src="/figma/nav/logo-icon.svg"
    />
  )
}

function CollapseIcon({ expanded }: { expanded: boolean }) {
  return (
    <img
      alt=""
      aria-hidden
      className={`app-logo-collapse-icon ${expanded ? "" : "app-logo-collapse-icon-flipped"}`}
      src="/figma/nav/close-icon.svg"
    />
  )
}

function formatTierLabel(value: string | null): string {
  if (!value) {
    return "No role"
  }

  if (value === "projectLead") {
    return "Project lead"
  }

  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function AppSidebar({ shell }: { shell: AppShellState }) {
  const [isManuallyCollapsed, setIsManuallyCollapsed] = useState(false)
  const [viewportWidth, setViewportWidth] = useState<number>(NAV_FORCE_COLLAPSE_WIDTH)
  const profileName = shell.displayName ?? "kolam user"
  const profileInitial = profileName.charAt(0).toUpperCase()
  const shellItems = [
    shell.configured ? "Live data" : "Preview data",
    shell.officeName ? `Office: ${shell.officeName}` : null,
    `Tier: ${formatTierLabel(shell.primaryTier)}`,
  ].filter((item): item is string => Boolean(item))

  useEffect(() => {
    function syncViewportWidth() {
      setViewportWidth(window.innerWidth)
    }

    syncViewportWidth()
    window.addEventListener("resize", syncViewportWidth)

    return () => window.removeEventListener("resize", syncViewportWidth)
  }, [])

  const isForcedCollapsed = viewportWidth < NAV_FORCE_COLLAPSE_WIDTH
  const isSidebarOpen = !isForcedCollapsed && !isManuallyCollapsed

  return (
    <aside className={`app-sidebar ${isSidebarOpen ? "app-sidebar-open" : "app-sidebar-closed"}`}>
      <div className="app-sidebar-top">
        <div className={`app-logo-row ${isSidebarOpen ? "app-logo-row-open" : "app-logo-row-closed"}`}>
          <div className="app-logo-brand">
            <BrandMark />
            {isSidebarOpen ? <span className="app-logo-name">kolam</span> : null}
          </div>
          <button
            aria-hidden={!isSidebarOpen}
            aria-label="Collapse sidebar"
            className={`app-nav-toggle-button ${isSidebarOpen ? "" : "app-control-hidden"}`}
            onClick={(event) => {
              event.preventDefault()
              setIsManuallyCollapsed(true)
            }}
            tabIndex={isSidebarOpen ? 0 : -1}
            type="button"
          >
            <CollapseIcon expanded />
          </button>
        </div>

        <SidebarNav isOpen={isSidebarOpen} />

        <div className={`app-pinned-divider ${isSidebarOpen ? "" : "app-pinned-divider-closed"}`} />

        <button
          aria-hidden={isSidebarOpen}
          aria-label="Expand sidebar"
          className={`app-nav-open-button ${isSidebarOpen ? "app-control-hidden" : ""}`}
          onClick={(event) => {
            event.preventDefault()
            if (!isForcedCollapsed) {
              setIsManuallyCollapsed(false)
            }
          }}
          tabIndex={isSidebarOpen ? -1 : 0}
          type="button"
        >
          <CollapseIcon expanded={false} />
        </button>

        {isSidebarOpen ? (
          <section className="app-pinned">
            <p>Session</p>
            <ul className="app-pinned-list">
              {shellItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {isSidebarOpen ? (
          <div className="app-sidebar-auth">
            {shell.isAuthenticated ? (
              <form action={signOutAction}>
                <button className="ghost-button" type="submit">
                  Sign out
                </button>
              </form>
            ) : shell.configured ? (
              <Link className="ghost-button" href="/login">
                Sign in
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={`app-sidebar-profile ${isSidebarOpen ? "" : "app-sidebar-profile-closed"}`}>
        <div
          aria-hidden="true"
          className={`app-profile-avatar app-profile-avatar-fallback ${isSidebarOpen ? "app-profile-avatar-open" : "app-profile-avatar-closed"}`}
        >
          {profileInitial}
        </div>
        {isSidebarOpen ? (
          <div>
            <p className="app-profile-name">{profileName}</p>
          </div>
        ) : null}
      </div>
    </aside>
  )
}
