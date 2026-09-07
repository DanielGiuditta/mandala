import path from "node:path"

/** @type {import("next").NextConfig} */
const nextConfig = {
  devIndicators: false,
  experimental: {
    devtoolSegmentExplorer: false,
  },
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  outputFileTracingIncludes: {
    "/api/preview-assets/*": ["../../node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "../../node_modules/pdfjs-dist/standard_fonts/**/*", "../../node_modules/pdfjs-dist/wasm/**/*", "../../node_modules/pdfjs-dist/cmaps/**/*"],
  },
  transpilePackages: ["@mandala/db", "@mandala/domain"],
}

export default nextConfig
