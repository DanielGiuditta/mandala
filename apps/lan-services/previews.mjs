import https from 'node:https'
import { constants } from 'node:fs'
import { mkdir, open, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { UUID, enrolled, json, previewType, readBody, required, sha256, tlsOptions, verifyPermit } from './security.mjs'

export const MAX_PREVIEW_BYTES = 25 * 1024 * 1024

export async function publish(root, resourceId, sourceHash, bytes, allowedSubjects) {
  if (!UUID.test(resourceId) || !/^[a-f0-9]{64}$/.test(sourceHash) || !Array.isArray(allowedSubjects) ||
      allowedSubjects.length === 0 || allowedSubjects.length > 10000 || allowedSubjects.some(id => !UUID.test(id))) {
    throw new Error('Invalid publication metadata or viewer allowlist')
  }
  if (bytes.length > MAX_PREVIEW_BYTES) throw new Error('Preview too large')
  const contentType = previewType(bytes)
  const digest = sha256(bytes)
  await mkdir(root, { recursive: true, mode: 0o750 })
  const object = path.join(root, digest)
  // Content-addressed objects are immutable. No request can select a filesystem path.
  try { await writeFile(object, bytes, { flag: 'wx', mode: 0o640 }) }
  catch (error) { if (error.code !== 'EEXIST') throw error }
  const manifest = { resourceId, sourceHash, digest, contentType, size: bytes.length, publishedAt: new Date().toISOString(), allowedSubjects }
  const temporary = path.join(root, `${resourceId}.${randomUUID()}.tmp`)
  await writeFile(temporary, JSON.stringify(manifest), { flag: 'wx', mode: 0o640 })
  await rename(temporary, path.join(root, `${resourceId}.json`))
  return manifest
}

export async function readPublished(root, id, sourceHash, subject, maxAgeSeconds = 86400) {
  if (!UUID.test(id)) throw new Error('Invalid resource')
  const metadataFile = await open(path.join(root, `${id}.json`), constants.O_RDONLY | constants.O_NOFOLLOW)
  let metadata
  try { metadata = JSON.parse(await metadataFile.readFile('utf8')) }
  finally { await metadataFile.close() }
  const age = Date.now() - Date.parse(metadata.publishedAt)
  if (metadata.resourceId !== id || metadata.sourceHash !== sourceHash || !metadata.allowedSubjects?.includes(subject) ||
      !/^[a-f0-9]{64}$/.test(metadata.digest) || !Number.isFinite(age) || age < 0 || age > maxAgeSeconds * 1000) {
    throw new Error('Preview unavailable, access denied, or publication expired')
  }
  const file = await open(path.join(root, metadata.digest), constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await file.stat()
    if (!stat.isFile() || stat.size !== metadata.size || stat.size > MAX_PREVIEW_BYTES) throw new Error('Invalid preview object')
    const bytes = await file.readFile()
    if (sha256(bytes) !== metadata.digest || previewType(bytes) !== metadata.contentType) throw new Error('Preview integrity check failed')
    return { metadata, bytes }
  } finally { await file.close() }
}

export function createPreviewReader({ tls, root, publicKey, maxAgeSeconds = 86400 }) {
  return https.createServer(tls, async (request, response) => {
    try {
      const match = /^\/previews\/([0-9a-f-]{36})$/.exec(request.url ?? '')
      if (request.method !== 'GET' || !match || !UUID.test(match[1])) return json(response, 404, { error: 'Preview unavailable' })
      const permit = verifyPermit(request.headers.authorization?.replace(/^Bearer /, ''), publicKey, match[1])
      const { metadata, bytes } = await readPublished(root, match[1], permit.sourceHash, permit.sub, maxAgeSeconds)
      response.writeHead(200, {
        'Content-Type': metadata.contentType, 'Content-Length': bytes.length,
        'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Preview-Published-At': metadata.publishedAt,
      })
      response.end(bytes)
    } catch { json(response, 404, { error: 'Preview unavailable, access denied, or publication expired' }) }
  })
}

export function createPreviewPublisher({ tls, root, allowlistFile }) {
  return https.createServer(tls, async (request, response) => {
    try {
      if (!enrolled(request, allowlistFile)) return json(response, 403, { error: 'Publisher is not enrolled' })
      const match = /^\/previews\/([0-9a-f-]{36})$/.exec(request.url ?? '')
      if (!match || !UUID.test(match[1])) return json(response, 404, { error: 'Unavailable operation' })
      if (request.method === 'DELETE') {
        await unlink(path.join(root, `${match[1]}.json`)).catch(error => { if (error.code !== 'ENOENT') throw error })
        return json(response, 200, { removed: true })
      }
      if (request.method !== 'PUT') return json(response, 405, { error: 'Unavailable operation' })
      const sourceHash = request.headers['x-source-hash']
      const allowedSubjects = JSON.parse(request.headers['x-viewer-subjects'] ?? 'null')
      const bytes = await readBody(request, MAX_PREVIEW_BYTES)
      const result = await publish(root, match[1], sourceHash, bytes, allowedSubjects)
      return json(response, 201, { resourceId: result.resourceId, digest: result.digest, publishedAt: result.publishedAt })
    } catch { json(response, 400, { error: 'Publication rejected' }) }
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = required('PREVIEW_MODE')
  const root = path.resolve(required('PREVIEW_ROOT'))
  const server = mode === 'reader'
    ? createPreviewReader({ tls: tlsOptions('PREVIEW', false), root, publicKey: await readFile(required('PREVIEW_PERMIT_PUBLIC_KEY'), 'utf8') })
    : mode === 'publisher' ? createPreviewPublisher({ tls: tlsOptions('PUBLISHER'), root, allowlistFile: required('PUBLISHER_DEVICES_FILE') })
    : (() => { throw new Error('PREVIEW_MODE must be reader or publisher') })()
  server.requestTimeout = 30000
  server.headersTimeout = 10000
  server.maxHeadersCount = 30
  server.listen(Number(process.env.PORT ?? (mode === 'reader' ? 8444 : 8445)), required('BIND_ADDRESS'))
}
