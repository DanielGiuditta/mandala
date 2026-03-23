import type { Metadata } from "next"
import { getCurrentViewerAccess } from "@mandala/db"

import { AppFrame } from "./components/app-frame"
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
    <html lang="en">
      <body>
        <AppFrame
          shell={{
            accessMessage: viewerAccess.accessMessage,
            configured: session.configured,
            displayName: viewerAccess.summary?.displayName ?? null,
            isAuthenticated: session.isAuthenticated,
            officeName: viewerAccess.summary?.officeName ?? null,
            primaryTier: viewerAccess.summary?.primaryTier ?? null,
            sessionEmail: session.sessionEmail,
          }}
        >
          {children}
        </AppFrame>
      </body>
    </html>
  )
}
