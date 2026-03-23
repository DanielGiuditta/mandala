"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

function FigmaIcon({ src }: { src: string }) {
  return (
    <img
      alt=""
      aria-hidden
      className="app-sidebar-icon"
      src={src}
    />
  )
}

const NAV_ITEMS = [
  { href: "/projects", iconSrc: "/figma/nav/projects-icon.svg", label: "Projects" },
  { href: "/people", iconSrc: "/figma/nav/people-icon.svg", label: "People" },
  { href: "/library", iconSrc: "/figma/nav/resources-icon.svg", label: "Resources" },
] as const

interface SidebarNavProps {
  isOpen: boolean
}

export function SidebarNav({ isOpen }: SidebarNavProps) {
  const pathname = usePathname()

  return (
    <nav aria-label="Primary" className="app-sidebar-nav app-sidebar-nav-track">
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)

        return (
          <Link
            aria-current={isActive ? "page" : undefined}
            className={`app-sidebar-link ${
              isOpen && isActive ? "app-sidebar-link-active-open" : ""
            }`}
            href={item.href}
            key={item.href}
          >
            <FigmaIcon src={item.iconSrc} />
            <span className={`app-sidebar-nav-label ${isOpen ? "" : "app-sidebar-nav-label-hidden"}`}>
              {item.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
