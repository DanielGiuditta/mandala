"use client"

import { useEffect, useRef, useState } from "react"

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
  const handoffParams = useRef<URLSearchParams | null>(null)
  const handoffRequest = useRef<Promise<{ error: string | null }> | null>(null)

  useEffect(() => {
    const hashParams = handoffParams.current ?? readHashParams()

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
    handoffParams.current = hashParams

    let isCancelled = false

    setIsProcessing(true)

    // Remove credentials from browser history before contacting the same-origin server.
    window.history.replaceState(null, "", window.location.pathname + window.location.search)
    handoffRequest.current ??= fetch("/auth/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accessToken,
        refreshToken,
      }),
    })
      .then(response => response.json())
    void handoffRequest.current
      .then(({ error }) => {
        if (isCancelled) {
          return
        }

        if (error) {
          setErrorMessage(error)
          setIsProcessing(false)
          return
        }

        window.location.replace(
          type === "invite" || type === "recovery" ? "/join" : "/projects",
        )
      })
      .catch(() => {
        if (!isCancelled) {
          setErrorMessage("Unable to reach Mandala. Check the office network connection.")
          setIsProcessing(false)
        }
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
