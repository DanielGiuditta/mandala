// Run only on the internal publishing workstation, never the internet gateway.
// Input is an explicitly approved export; this tool does not execute converters,
// crawl shares, or accept source paths from the web application.
import https from 'node:https'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { previewType, required, sha256, UUID } from './security.mjs'
import { MAX_PREVIEW_BYTES } from './previews.mjs'

const config = JSON.parse(await readFile(process.argv[2], 'utf8'))
const origin = new URL(config.publisherUrl)
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('HTTPS publisher origin required')
const options = {
  cert: await readFile(required('PUBLISHER_CLIENT_CERT')),
  key: await readFile(required('PUBLISHER_CLIENT_KEY')),
  ca: await readFile(required('PUBLISHER_SERVER_CA')),
  minVersion: 'TLSv1.2',
}
const exportRoot = await realpath(config.exportRoot)
for (const item of config.documents) {
  if (!UUID.test(item.resourceId)) throw new Error('Invalid resource ID')
  let bytes = Buffer.alloc(0)
  if (!item.remove) {
    if (typeof item.serverPath !== 'string' || !item.serverPath.startsWith('\\\\')) throw new Error('Original UNC reference required')
    const file = await realpath(path.resolve(exportRoot, item.previewFile))
    const relative = path.relative(exportRoot, file)
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Export is outside approved folder')
    bytes = await readFile(file)
    if (bytes.length > MAX_PREVIEW_BYTES) throw new Error('Preview exceeds 25 MB')
    previewType(bytes)
    if (!Array.isArray(item.allowedSubjects) || !item.allowedSubjects.length || item.allowedSubjects.some(id => !UUID.test(id))) throw new Error('Explicit permitted Mandala auth user IDs required')
  }
  const result = await new Promise((resolve, reject) => {
    const req = https.request(new URL(`/previews/${item.resourceId}`, origin), {
      ...options, method: item.remove ? 'DELETE' : 'PUT', timeout: 30000,
      headers: { 'Content-Length': bytes.length, ...(item.remove ? {} : {
        'X-Source-Hash': sha256(item.serverPath),
        'X-Viewer-Subjects': JSON.stringify(item.allowedSubjects),
        'Content-Type': previewType(bytes),
      }) },
    }, response => {
      const chunks = []
      response.on('data', chunk => chunks.push(chunk))
      response.on('end', () => response.statusCode >= 200 && response.statusCode < 300
        ? resolve(Buffer.concat(chunks).toString()) : reject(new Error(`Publication failed: HTTP ${response.statusCode}`)))
    })
    req.on('timeout', () => req.destroy(new Error('Publication timeout')))
    req.on('error', reject)
    req.end(bytes)
  })
  console.log(result)
}
