import { createHash, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'

export const PRODUCTION = 'https://nzlajptokbcgeaifgnoq.supabase.co'
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const sha256 = (data) => createHash('sha256').update(data).digest('hex')
export function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}
export function tlsOptions(prefix, clientAuth = true) {
  return {
    key: readFileSync(required(`${prefix}_TLS_KEY`)),
    cert: readFileSync(required(`${prefix}_TLS_CERT`)),
    minVersion: 'TLSv1.2',
    ...(clientAuth ? {
      ca: readFileSync(required(`${prefix}_CLIENT_CA`)),
      requestCert: true, rejectUnauthorized: true,
    } : {}),
  }
}
// Reload on every request so IT can revoke a device without restarting the service.
export function enrolled(request, allowlistFile) {
  const fingerprint = request.socket.getPeerCertificate()?.fingerprint256
  const allowed = JSON.parse(readFileSync(allowlistFile, 'utf8'))
  return request.socket.authorized && Array.isArray(allowed) && allowed.includes(fingerprint)
}
export async function readBody(request, maxBytes = 16384) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) throw new Error('Request too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}
export function json(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(JSON.stringify(value))
}
export function verifyPermit(token, publicKey, resourceId, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 4096) throw new Error('Invalid permit')
  const parts = token.split('.')
  if (parts.length !== 2 || !verify(null, Buffer.from(parts[0]), publicKey, Buffer.from(parts[1], 'base64url'))) {
    throw new Error('Invalid permit')
  }
  const data = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
  const seconds = Math.floor(now / 1000)
  if (data.aud !== 'mandala-lan-preview' || data.resourceId !== resourceId || !UUID.test(data.sub ?? '') ||
      !UUID.test(resourceId) || !/^[a-f0-9]{64}$/.test(data.sourceHash) ||
      !Number.isInteger(data.exp) || data.exp <= seconds || data.exp > seconds + 30) {
    throw new Error('Invalid permit')
  }
  return data
}
export function previewType(bytes) {
  if (bytes.subarray(0, 5).toString() === '%PDF-') return 'application/pdf'
  if (bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return 'image/png'
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'image/jpeg'
  throw new Error('Only exported PDF, PNG, or JPEG previews are accepted')
}
