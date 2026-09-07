import { readFile } from "node:fs/promises"
import path from "node:path"

export const runtime = "nodejs"
// Use Node's resolver here: webpack's require.resolve yields a module ID rather
// than a filesystem path for bundled JSON files.
const nodeRequire = process.getBuiltinModule("module").createRequire(path.join(process.cwd(), "package.json"))
const packageRoot = path.dirname(nodeRequire.resolve("pdfjs-dist/package.json"))

export async function GET(_request: Request, context: { params: Promise<{ asset: string[] }> }) {
  const { asset } = await context.params
  const [directory, filename] = asset
  // Fixed installed-package assets only. Never accept paths to office documents.
  const allowed = asset.length === 2 && (
    directory === "build" && filename === "pdf.worker.min.mjs" ||
    directory === "standard_fonts" && /^(Foxit[A-Za-z]+\.pfb|LiberationSans-[A-Za-z]+\.ttf)$/.test(filename) ||
    directory === "wasm" && ["jbig2.wasm", "openjpeg.wasm", "qcms_bg.wasm", "jbig2_nowasm_fallback.js", "openjpeg_nowasm_fallback.js"].includes(filename) ||
    directory === "cmaps" && /^[A-Za-z0-9_-]+\.bcmap$/.test(filename)
  )
  if (!allowed) return new Response("Unavailable asset", { status: 404 })
  try {
    const bytes = await readFile(path.join(packageRoot, directory, filename))
    return new Response(bytes, { headers: {
      "Content-Type": /\.m?js$/.test(filename) ? "text/javascript" : filename.endsWith(".wasm") ? "application/wasm" : "application/octet-stream",
      "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff",
    } })
  } catch { return new Response("Unavailable asset", { status: 404 }) }
}
