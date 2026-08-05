import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { basename } from "node:path"

const [installerPath, expectedVersion, expectedSha256, expectedSizeText] = process.argv.slice(2)

if (!installerPath || !expectedVersion || !expectedSha256 || !expectedSizeText) {
  throw new Error(
    "Usage: node verify-downloaded-release.mjs <installer.exe> <version> <sha256> <size-bytes>",
  )
}

if (!/^\d+\.\d+\.\d+$/.test(expectedVersion)) {
  throw new Error("Expected version must use major.minor.patch format.")
}

if (!/^[a-f0-9]{64}$/i.test(expectedSha256)) {
  throw new Error("Expected SHA-256 must contain exactly 64 hexadecimal characters.")
}

const expectedSize = Number(expectedSizeText)
if (!Number.isSafeInteger(expectedSize) || expectedSize <= 0) {
  throw new Error("Expected size must be a positive integer number of bytes.")
}

const expectedFilename = `MandalaAgentSetup-${expectedVersion}.exe`
if (basename(installerPath) !== expectedFilename) {
  throw new Error(
    `Wrong filename: expected ${expectedFilename}, received ${basename(installerPath)}.`,
  )
}

const content = await readFile(installerPath)
if (content[0] !== 0x4d || content[1] !== 0x5a) {
  throw new Error("The downloaded file is not a Windows PE executable.")
}

if (content.length !== expectedSize) {
  throw new Error(
    `Wrong file size: expected ${expectedSize} bytes, received ${content.length} bytes.`,
  )
}

const actualSha256 = createHash("sha256").update(content).digest("hex")
if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
  throw new Error(
    `Checksum mismatch: expected ${expectedSha256.toLowerCase()}, received ${actualSha256}.`,
  )
}

console.log(`PASS: ${expectedFilename}`)
console.log(`Version: ${expectedVersion}`)
console.log(`Size: ${content.length} bytes`)
console.log(`SHA-256: ${actualSha256}`)
console.log("This file exactly matches the audited release artifact.")
