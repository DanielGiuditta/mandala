"use client"

import { createBrowserClient } from "@supabase/ssr"
import { useEffect, useState } from "react"

interface AuthHashHandoffProps {
  redirectIfNoHash?: string | null
}

function readHashParams(): URLSearchParams | null {
  if (typeof window === "undefined" || !window.location.hash.startsWith("#")) {
    return null
  }

  const params = new URLSearchParams(window.location.hash.slice(1))
  return params.size > 0 ? params : null
}

export function AuthHashHandoff({
  redirectIfNoHash = null,
}: AuthHashHandoffProps) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    const hashParams = readHashParams()

    if (!hashParams) {
      if (redirectIfNoHash) {
        window.location.replace(redirectIfNoHash)
      }

      return
    }

    const accessToken = hashParams.get("access_token")
    const errorDescription = hashParams.get("error_description")
    const refreshToken = hashParams.get("refresh_token")
    const type = hashParams.get("type")

    if (errorDescription) {
      setErrorMessage(errorDescription)
      return
    }

    if (!accessToken || !refreshToken) {
      return
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      setErrorMessage("Supabase auth is not configured for this workspace yet.")
      return
    }

    let isCancelled = false

    setIsProcessing(true)

    const supabase = createBrowserClient(url, key)

    void supabase.auth
      .setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      .then(({ error }) => {
        if (isCancelled) {
          return
        }

        if (error) {
          setErrorMessage(error.message)
          setIsProcessing(false)
          return
        }

        window.location.replace(
          type === "invite" || type === "recovery" ? "/join" : "/projects",
        )
      })

    return () => {
      isCancelled = true
    }
  }, [redirectIfNoHash])

  if (!errorMessage && !isProcessing) {
    return null
  }

  return <div className="ui-notice">{errorMessage ?? "Finishing sign-in..."}</div>
}
