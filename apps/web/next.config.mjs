import path from "node:path"

/** @type {import("next").NextConfig} */
const nextConfig = {
  devIndicators: false,
  experimental: {
    devtoolSegmentExplorer: false,
  },
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  transpilePackages: ["@mandala/db", "@mandala/domain"],
}

export default nextConfig
