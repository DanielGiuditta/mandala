"use client"

import { useEffect, useRef, useState } from "react"
import type { PDFDocumentProxy } from "pdfjs-dist"

export function ResourcePreview({ resourceId }: { resourceId: string }) {
  const [error, setError] = useState<string | null>(null)
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [image, setImage] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [busy, setBusy] = useState(true)
  const canvas = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    let disposed = false
    let document: PDFDocumentProxy | null = null
    let imageUrl: string | null = null
    let task: ReturnType<typeof import("pdfjs-dist").getDocument> | null = null
    setError(null)
    setPdf(null)
    setImage(null)
    setBusy(true)
    void (async () => {
      const response = await fetch(`/api/resources/${resourceId}/preview`, { cache: "no-store", signal: controller.signal })
      if (!response.ok) throw new Error(await response.text())
      const type = response.headers.get("content-type")
      const bytes = await response.arrayBuffer()
      if (disposed) return
      if (type === "application/pdf") {
        const renderer = await import("pdfjs-dist")
        if (disposed) return
        renderer.GlobalWorkerOptions.workerSrc = "/api/preview-assets/build/pdf.worker.min.mjs"
        task = renderer.getDocument({
          data: bytes,
          // Only page drawing is used. Never instantiate PDFScriptingManager,
          // annotation links/forms, embedded attachments, or an HTML document viewer.
          useWorkerFetch: false,
          standardFontDataUrl: "/api/preview-assets/standard_fonts/",
          wasmUrl: "/api/preview-assets/wasm/",
          cMapUrl: "/api/preview-assets/cmaps/", cMapPacked: true,
          stopAtErrors: true,
          maxImageSize: 16 * 1024 * 1024,
        })
        document = await task.promise
        if (disposed) { await task.destroy(); return }
        if (document.numPages > 500) throw new Error("This document is too long for the office preview. Ask IT for a shorter export.")
        setPdf(document)
        setPage(1)
      } else if (type === "image/png" || type === "image/jpeg") {
        imageUrl = URL.createObjectURL(new Blob([bytes], { type }))
        setImage(imageUrl)
        setBusy(false)
      } else throw new Error("This preview format is unavailable.")
    })().catch(reason => {
      if (!disposed) { setError(reason instanceof Error ? reason.message : "Unable to display this preview."); setBusy(false) }
    })
    return () => {
      disposed = true
      controller.abort()
      if (imageUrl) URL.revokeObjectURL(imageUrl)
      void task?.destroy()
    }
  }, [resourceId])

  useEffect(() => {
    if (!pdf || !canvas.current) return
    let disposed = false
    let renderTask: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | null = null
    setBusy(true)
    void (async () => {
      const pdfPage = await pdf.getPage(page)
      if (disposed || !canvas.current) return
      const natural = pdfPage.getViewport({ scale: 1 })
      const viewport = pdfPage.getViewport({ scale: Math.min(2, 3000 / Math.max(natural.width, natural.height)) })
      canvas.current.width = Math.ceil(viewport.width)
      canvas.current.height = Math.ceil(viewport.height)
      renderTask = pdfPage.render({ canvas: canvas.current, viewport, annotationMode: 0, isEditing: false })
      await renderTask.promise
      if (!disposed) setBusy(false)
    })().catch(reason => {
      if (!disposed) { setError(reason instanceof Error ? reason.message : "Unable to display this page."); setBusy(false) }
    })
    return () => { disposed = true; renderTask?.cancel() }
  }, [pdf, page])

  return (
    <div className="resource-preview-content">
      {error ? <p className="ui-notice" role="alert">{error}</p> : null}
      {busy && !error ? <p className="pd-meta-text" role="status">Loading preview…</p> : null}
      {pdf && !error ? (
        <div className="resource-document-actions">
          <button className="pd-text-button" disabled={page <= 1 || busy} onClick={() => setPage(value => value - 1)}>Previous page</button>
          <span className="pd-meta-text">Page {page} of {pdf.numPages}</span>
          <button className="pd-text-button" disabled={page >= pdf.numPages || busy} onClick={() => setPage(value => value + 1)}>Next page</button>
        </div>
      ) : null}
      <canvas key={page} className="resource-preview-image" ref={canvas} hidden={!pdf || Boolean(error)} role="img" aria-label={`Document preview, page ${page}`} />
      {image && !error ? <img className="resource-preview-image" src={image} alt="Approved document preview" /> : null}
    </div>
  )
}
