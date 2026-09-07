import https from 'node:https'
import { pathToFileURL } from 'node:url'
import { PRODUCTION, enrolled, json, readBody, required, tlsOptions } from './security.mjs'

const rpcNames = new Set([
  'list_time_tracker_projects_for_current_user',
  'start_desktop_work_session', 'touch_desktop_work_session', 'finish_desktop_work_session',
])
// Exact methods, paths and query shapes; never a general proxy or a caller-selected destination.
export function allowedRequest(method, rawUrl) {
  if (!rawUrl?.startsWith('/') || rawUrl.startsWith('//') || /[%\\]/.test(rawUrl.split('?')[0])) return false
  const url = new URL(rawUrl, PRODUCTION)
  if (method === 'POST' && url.pathname === '/auth/v1/token') {
    return ['?grant_type=password', '?grant_type=refresh_token'].includes(url.search)
  }
  if (method === 'POST' && url.pathname.startsWith('/rest/v1/rpc/')) {
    return !url.search && rpcNames.has(url.pathname.slice('/rest/v1/rpc/'.length))
  }
  return false
}

export function createGateway({ tls, apiKey, allowlistFile, upstream = fetch }) {
  const limits = new Map()
  const server = https.createServer(tls, async (request, response) => {
    try {
      if (!enrolled(request, allowlistFile)) return json(response, 403, { error: 'Device is not enrolled' })
      const identity = request.socket.getPeerCertificate().fingerprint256
      const minute = Math.floor(Date.now() / 60000)
      if (limits.size > 10000) limits.clear()
      const current = limits.get(identity)
      const rate = current?.minute === minute ? current : { minute, count: 0 }
      limits.set(identity, rate)
      if (++rate.count > 120) return json(response, 429, { error: 'Please retry shortly' })
      if (request.method === 'GET' && request.url === '/health') {
        return json(response, 200, { backend: PRODUCTION, protocol: 1 })
      }
      if (!allowedRequest(request.method, request.url)) return json(response, 404, { error: 'Unavailable operation' })
      const authorization = request.headers.authorization
      if (request.url.startsWith('/rest/') && !/^Bearer [A-Za-z0-9_.-]+$/.test(authorization ?? '')) {
        return json(response, 401, { error: 'Sign in required' })
      }
      if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
        return json(response, 415, { error: 'JSON required' })
      }
      const body = await readBody(request)
      JSON.parse(body.toString('utf8'))
      const result = await upstream(PRODUCTION + request.url, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(8000),
        headers: { apikey: apiKey, 'Content-Type': 'application/json', ...(authorization ? { Authorization: authorization } : {}) },
        body,
      })
      // Never forward cookies, redirects, or arbitrary upstream response headers.
      const data = await result.text()
      response.writeHead(result.status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
      response.end(data)
    } catch {
      if (!response.headersSent) json(response, 503, { error: 'Gateway unavailable; time remains on this computer' })
      else response.destroy()
    }
  })
  server.requestTimeout = 15000
  server.headersTimeout = 10000
  server.maxHeadersCount = 30
  return server
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  // Deliberately no service-role key or configurable upstream hostname.
  createGateway({ tls: tlsOptions('GATEWAY'), apiKey: required('SUPABASE_ANON_KEY'), allowlistFile: required('GATEWAY_DEVICES_FILE') })
    .listen(Number(process.env.PORT ?? 8443), required('BIND_ADDRESS'))
}
