import Link from "next/link"
import type { Metadata } from "next"

import "./globals.css"

export const metadata: Metadata = {
  title: "Mandala",
  description: "Internal tracker for projects, people, staffing, time, and documents.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <div>
              <h1>Mandala</h1>
              <p className="app-subtitle">
                Technical scaffold for projects, people, checklist items, documents, and
                project time visibility.
              </p>
            </div>
            <nav aria-label="Primary" className="app-nav">
              <Link href="/projects">Projects</Link>
              <Link href="/people">People</Link>
              <Link href="/library">Library</Link>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  )
}
