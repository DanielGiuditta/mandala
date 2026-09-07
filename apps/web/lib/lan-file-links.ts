export function isApprovedLanFilePath(serverPath: string): boolean {
  const parts = serverPath.slice(2).split("\\")
  if (!serverPath.startsWith("\\\\") || parts.length < 3 || !/^[a-z0-9.-]+$/i.test(parts[0]) ||
      parts.some(part => !part || part === "." || part === ".." || /[\x00-\x1f/:<>|?*]/.test(part) || /[. ]$/.test(part))) {
    return false
  }
  try {
    const roots: unknown = JSON.parse(process.env.NEXT_PUBLIC_LAN_FILE_SHARES ?? "[]")
    return Array.isArray(roots) && roots.some(root => typeof root === "string" &&
      root.startsWith("\\\\") && serverPath.toLowerCase().startsWith(root.replace(/\\+$/, "").toLowerCase() + "\\"))
  } catch { return false }
}
