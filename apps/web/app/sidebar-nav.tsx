"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { TokenIcon } from "./components/ui/token-icon"

function FigmaIcon({ src }: { src: string }) {
  return (
    <TokenIcon className="app-sidebar-icon" src={src} />
  )
}

function TimeTrackerIcon() {
  return (
    <svg
      aria-hidden
      className="app-sidebar-icon"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7.6v4.9l3.1 2"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  )
}

const NAV_ITEMS = [
  {
    href: "/projects",
    label: "Projects",
    renderIcon: () => <FigmaIcon src="/figma/nav/projects-icon.svg" />,
  },
  {
    href: "/people",
    label: "People",
    renderIcon: () => <FigmaIcon src="/figma/nav/people-icon.svg" />,
  },
  {
    href: "/time-tracker",
    label: "Time tracker",
    renderIcon: () => <TimeTrackerIcon />,
  },
  {
    href: "/library",
    label: "Resources",
    renderIcon: () => <FigmaIcon src="/figma/nav/resources-icon.svg" />,
  },
] as const

interface SidebarNavProps {
  isOpen: boolean
}

export function SidebarNav({ isOpen }: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary" className="app-sidebar-nav app-sidebar-nav-track">
      {NAV_ITEMS.map((item) => {
        const isProjectsRoot = item.href === "/projects" && pathname === "/"
        const isActive =
          isProjectsRoot || pathname === item.href || pathname.startsWith(`${item.href}/`)

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`app-sidebar-link ${
              isOpen && isActive ? "app-sidebar-link-active-open" : ""
            }`}
            href={item.href}
            key={item.href}
            prefetch={false}
          >
            {item.renderIcon()}
            <span className={`app-sidebar-nav-label ${isOpen ? "" : "app-sidebar-nav-label-hidden"}`}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
