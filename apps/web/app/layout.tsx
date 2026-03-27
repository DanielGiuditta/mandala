import type { Metadata } from "next"
import { getCurrentViewerAccess } from "@mandala/db"
import Script from "next/script"

import { AppFrame } from "./components/app-frame"
import { THEME_INIT_SCRIPT } from "./components/theme"
import { getAppSessionState } from "../lib/auth/session"

import "./globals.css"

export const metadata: Metadata = {
  title: "Mandala",
  description: "Internal tracker for projects, people, staffing, time, and documents.",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const session = await getAppSessionState()
  const viewerAccess = await getCurrentViewerAccess({
    accessToken: session.accessToken,
    sessionEmail: session.sessionEmail,
  })

  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script
          id="mandala-theme-init"
          strategy="beforeInteractive"
        >
          {THEME_INIT_SCRIPT}
        </Script>
        <AppFrame
          shell={{
            accessMessage: viewerAccess.accessMessage,
            configured: session.configured,
            displayName: viewerAccess.summary?.displayName ?? null,
            isAuthenticated: session.isAuthenticated,
            officeName: viewerAccess.summary?.officeName ?? null,
            photoUrl: viewerAccess.summary?.photoUrl ?? null,
            primaryTier: viewerAccess.summary?.primaryTier ?? null,
            sessionEmail: session.sessionEmail,
            viewerEmail: viewerAccess.summary?.email ?? null,
          }}
        >
          {children}
        </AppFrame>
      </body>
    </html>
  )
}
