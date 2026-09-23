// Protocol fixture for the unchanged approved Windows Agent. No database or
// outbound network implementation is present: createGateway always receives
// this in-memory upstream, and a stray global fetch fails immediately.
import { readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createGateway } from '../../../lan-services/gateway.mjs'

globalThis.fetch = async () => { throw new Error('External requests forbidden in Agent LAN fixture') }
const [configurationPath, controlPath, evidencePath] = process.argv.slice(2)
if (!configurationPath || !controlPath || !evidencePath) throw new Error('Three fixture paths required')
const configuration = JSON.parse(readFileSync(configurationPath, 'utf8').replace(/^\uFEFF/, ''))
if (configuration.bindAddress !== '127.0.0.1' || configuration.port !== 8443 || configuration.supabaseAnonKey !== 'mandala-protocol-fixture-only') {
  throw new Error('Fixture must be isolated to loopback with its synthetic key')
}
const projects = [
  { id: '11111111-1111-4111-8111-111111111111', name: 'CI protocol project A' },
  { id: '22222222-2222-4222-8222-222222222222', name: 'CI protocol project B' },
]
// Only the disposable OS-reboot harness opts into restoring its synthetic server.
// Ordinary UI tests start with fresh state. This file never stores auth tokens.
const restore = process.argv[5] === '--restore-state' && existsSync(evidencePath)
  ? JSON.parse(readFileSync(evidencePath, 'utf8').replace(/^\uFEFF/, '')) : null
if (restore && (restore.fixture !== 'PROTOCOL FIXTURE - NOT PRODUCTION ACCEPTANCE' || restore.productionRequests !== 0)) {
  throw new Error('Only isolated synthetic evidence may be restored')
}
const sessions = new Map((restore?.sessions ?? []).map(s => [s.id, s]))
const requests = restore?.requests ?? []
let listening = false
let transitioning = false
let blockedExternalRequests = 0
const persist = () => {
  writeFileSync(evidencePath + '.tmp', JSON.stringify({
    fixture: 'PROTOCOL FIXTURE - NOT PRODUCTION ACCEPTANCE', listening,
    productionRequests: 0, blockedExternalRequests, requests,
    sessions: [...sessions.values()],
  }, null, 2))
  renameSync(evidencePath + '.tmp', evidencePath)
}
const result = (status, body) => ({ status, text: async () => JSON.stringify(body) })
const upstream = async (url, options) => {
  const request = new URL(url)
  if (request.origin !== 'https://nzlajptokbcgeaifgnoq.supabase.co' || options.method !== 'POST') {
    blockedExternalRequests++
    persist()
    throw new Error('Unexpected protocol fixture request')
  }
  const body = JSON.parse(options.body.toString('utf8'))
  const operation = request.pathname.split('/').at(-1)
  requests.push({ operation, utc: new Date().toISOString(), ...(body.session_id ? { sessionId: body.session_id } : {}) })
  let response
  if (request.pathname === '/auth/v1/token') {
    const valid = request.search === '?grant_type=password'
      ? body.email === 'lan-fixture@example.test' && body.password === 'fixtureonly'
      : request.search === '?grant_type=refresh_token' && body.refresh_token === 'fixture-refresh-token'
    response = valid ? result(200, { access_token: 'fixture-access-token', refresh_token: 'fixture-refresh-token' }) : result(400, { error: 'Synthetic credentials required' })
  } else if (options.headers.Authorization !== 'Bearer fixture-access-token') {
    response = result(401, { error: 'Synthetic authentication required' })
  } else if (operation === 'list_time_tracker_projects_for_current_user') {
    response = result(200, projects)
  } else if (operation === 'start_desktop_work_session') {
    const existing = sessions.get(body.session_id)
    if (!/^[a-f0-9-]{36}$/i.test(body.session_id ?? '') || !projects.some(p => p.id === body.target_project_id) || !/^\d{4}-\d{2}-\d{2}$/.test(body.entry_date ?? '')) {
      response = result(400, { error: 'Invalid synthetic start' })
    } else if (existing && (existing.project_id !== body.target_project_id || existing.entry_date !== body.entry_date)) {
      response = result(400, { error: 'Session identity changed' })
    } else if (!existing && [...sessions.values()].some(s => !s.stopped_at)) {
      response = result(400, { error: 'Existing synthetic session still active' })
    } else {
      const session = existing ?? { id: body.session_id, project_id: body.target_project_id, entry_date: body.entry_date, started_at: new Date().toISOString(), stopped_at: null, time_entry_id: null, finishRequests: 0 }
      sessions.set(session.id, session)
      response = result(200, session)
    }
  } else if (operation === 'touch_desktop_work_session') {
    response = sessions.has(body.session_id) ? result(200, null) : result(400, { error: 'Unknown synthetic session' })
  } else if (operation === 'finish_desktop_work_session') {
    const session = sessions.get(body.session_id)
    if (!session || !Number.isFinite(Date.parse(body.stopped_at)) || Date.parse(body.stopped_at) < Date.parse(session.started_at)) {
      response = result(400, { error: 'Invalid synthetic finish' })
    } else {
      session.finishRequests++
      // Tests exercise receipt/journal handling, not production rounding or SQL.
      if (!session.stopped_at) { session.stopped_at = body.stopped_at; session.time_entry_id = randomUUID() }
      response = result(200, session)
    }
  } else {
    response = result(404, { error: 'Unexpected synthetic RPC' })
  }
  persist()
  return response
}
const server = createGateway({
  tls: { pfx: readFileSync(configuration.serverPfx), passphrase: configuration.serverPfxPassword,
    ca: readFileSync(configuration.deviceCaCertificate), requestCert: true, rejectUnauthorized: true, minVersion: 'TLSv1.2' },
  apiKey: 'mandala-protocol-fixture-only', allowlistFile: configuration.enrolledDevices, upstream,
})
server.on('error', error => { console.error(error.code ?? 'FIXTURE_SERVER_ERROR'); process.exitCode = 1; clearInterval(watcher) })
persist()
const watcher = setInterval(() => {
  if (transitioning) return
  let desired
  try { desired = JSON.parse(readFileSync(controlPath, 'utf8').replace(/^\uFEFF/, '')) } catch { return }
  if (desired.shutdown === true) {
    clearInterval(watcher)
    server.closeAllConnections()
    server.close(() => { listening = false; persist(); process.exit(0) })
    if (!listening) process.exit(0)
  } else if (desired.online === true && !listening) {
    transitioning = true
    server.listen(8443, '127.0.0.1', () => { listening = true; transitioning = false; persist() })
  } else if (desired.online === false && listening) {
    transitioning = true
    server.closeAllConnections()
    server.close(() => { listening = false; transitioning = false; persist() })
  }
}, 100)
