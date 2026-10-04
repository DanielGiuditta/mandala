// Maintainer-only READS. This verifies a bounded LAN pilot observation, not the
// full office acceptance suite. Never distribute the read credential to IT PCs.
// node verify-pilot-save.mjs --example switch-offline > pilot.json
// node --env-file=<private-production-env> verify-pilot-save.mjs pilot.json
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

export const production = 'https://nzlajptokbcgeaifgnoq.supabase.co'
export const pilotGateway = 'https://192.168.30.80:8443'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/
const sha256 = /^[a-f0-9]{64}$/i
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const nonempty = value => typeof value === 'string' && value.trim().length > 0
const time = (value, label) => {
  assert(typeof value === 'string' && /T.*Z$/.test(value) && Number.isFinite(Date.parse(value)), `${label}: a UTC timestamp ending in Z is required.`)
  return Date.parse(value)
}
const productionTime = (value, label) => {
  assert(typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), `${label}: a finalized timestamp with an explicit timezone is required.`)
  return Date.parse(value)
}
const utc = value => new Date(value).toISOString()
const localDate = (value, offset) => utc(value + offset * 60000).slice(0, 10)
const durationToleranceSeconds = 5
const timestampToleranceMs = 15000
const commonObservations = ['directInternetBlocked', 'noPendingAtStart', 'noPendingAtEnd', 'noActiveTimerAtEnd']
const offlineObservations = ['selectionDidNotSwitch', 'cancelDidNotSwitch', 'pendingWhileDisconnected', 'pendingSurvivedReopen', 'newStartBlockedWhilePending', 'pendingClearedAfterReconnect']

export function exampleEvidence(scope = 'switch-offline') {
  assert(['switch-offline', 'first-save'].includes(scope), 'Example scope must be switch-offline or first-save.')
  return {
    schemaVersion: 1, scope, backend: production,
    person: { id: null, email: null },
    workstation: { computer: null, windowsUser: null, agentVersion: null, backend: null, gatewayOrigin: null, gatewayCertificateSha256: null },
    gateway: { origin: pilotGateway, certificateSha256: null, checkedAtUtc: null, mutualTlsPassed: null },
    startedAtUtc: null, completedAtUtc: null, localUtcOffsetMinutes: 330,
    timingSource: null,
    observations: Object.fromEntries([...commonObservations, ...(scope === 'switch-offline' ? offlineObservations : [])].map(key => [key, null])),
    ...(scope === 'switch-offline' ? { outage: { disconnectedAtUtc: null, reopenedAtUtc: null, reconnectedAtUtc: null } } : {}),
    sessions: (scope === 'switch-offline' ? ['switch', 'offline'] : ['stop']).map(kind => ({
      kind, projectId: null, sessionId: null, timeEntryId: null, entryDate: null,
      observedStartedAtUtc: null, observedStoppedAtUtc: null, observedElapsedSeconds: null, receiptObservedAtUtc: null,
    })),
  }
}

function validateEvidence(report, now) {
  assert(report?.schemaVersion === 1 && ['switch-offline', 'first-save'].includes(report.scope), 'Expected schemaVersion 1 and scope switch-offline or first-save.')
  assert(report.backend === production && report.workstation?.backend === production, 'Report and Agent must identify the production backend.')
  assert(uuid.test(report.person?.id ?? '') && typeof report.person.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(report.person.email), 'Exact lowercase person UUID and employee email are required.')
  for (const key of ['computer', 'windowsUser', 'agentVersion']) assert(nonempty(report.workstation[key]), `workstation.${key} is required.`)
  assert(report.workstation.agentVersion === '1.0.16', 'This pilot expects approved Agent 1.0.16; review a different release before using this verifier.')
  assert(report.gateway?.origin === pilotGateway && report.workstation.gatewayOrigin === pilotGateway, 'Both observations must identify current STP80 gateway https://192.168.30.80:8443.')
  assert(sha256.test(report.gateway.certificateSha256 ?? '') && report.gateway.certificateSha256.toLowerCase() === report.workstation.gatewayCertificateSha256?.toLowerCase(), 'Gateway and employee TLS observations must identify the same SHA-256 server certificate.')
  assert(report.gateway.mutualTlsPassed === true, 'A successful enrolled-device mutual-TLS check is required.')
  const from = time(report.startedAtUtc, 'Run start'), until = time(report.completedAtUtc, 'Run completion')
  const checked = time(report.gateway.checkedAtUtc, 'Gateway check')
  assert(until > from && until - from <= 24 * 3600000 && until <= now + 5000, 'Run must be complete, at most 24 hours long, and not in the future.')
  assert(checked <= from, 'Gateway observation must precede the run.')
  assert(Number.isInteger(report.localUtcOffsetMinutes) && Math.abs(report.localUtcOffsetMinutes) <= 14 * 60, 'An explicit local UTC offset in minutes is required.')
  assert(nonempty(report.timingSource), 'Describe the independent stopwatch/clock used; do not derive observed timing from database rows.')
  for (const key of [...commonObservations, ...(report.scope === 'switch-offline' ? offlineObservations : [])]) assert(report.observations?.[key] === true, `Missing or failed observation: ${key}.`)
  const kinds = report.scope === 'switch-offline' ? ['switch', 'offline'] : ['stop']
  assert(Array.isArray(report.sessions) && report.sessions.length === kinds.length, `Scope requires exactly ${kinds.length} observed session(s).`)
  const sessions = new Set(), entries = new Set()
  for (const [index, session] of report.sessions.entries()) {
    assert(session.kind === kinds[index], `Session ${index + 1} must have kind ${kinds[index]}.`)
    for (const key of ['projectId', 'sessionId', 'timeEntryId']) assert(uuid.test(session[key] ?? ''), `Session ${index + 1}: exact lowercase ${key} UUID required.`)
    assert(!sessions.has(session.sessionId) && !entries.has(session.timeEntryId), 'Session or time-entry UUID is repeated.')
    sessions.add(session.sessionId); entries.add(session.timeEntryId)
    const start = time(session.observedStartedAtUtc, 'Observed confirmed start')
    const stop = time(session.observedStoppedAtUtc, 'Observed stop/switch')
    const receipt = time(session.receiptObservedAtUtc, 'Observed save reference')
    assert(start >= from && stop > start && receipt >= stop && receipt <= until, 'Observed session and receipt timestamps must be ordered within the run.')
    assert(typeof session.observedElapsedSeconds === 'number' && Number.isFinite(session.observedElapsedSeconds) && session.observedElapsedSeconds >= 120 && session.observedElapsedSeconds <= 86400, 'Independently measured elapsed time must be between two minutes and 24 hours.')
    assert(Math.abs((stop - start) / 1000 - session.observedElapsedSeconds) <= durationToleranceSeconds, 'Independent stopwatch and observed timestamps disagree by more than five seconds.')
    assert(session.entryDate === localDate(start, report.localUtcOffsetMinutes), 'Reported entry date must equal the independently observed local start date.')
  }
  if (report.scope === 'switch-offline') {
    const [a, b] = report.sessions
    assert(a.projectId !== b.projectId, 'Confirmed switch must target a different project.')
    assert(time(b.observedStartedAtUtc, 'Second start') >= time(a.observedStoppedAtUtc, 'First stop'), 'Second session begins before the first was stopped.')
    const disconnected = time(report.outage?.disconnectedAtUtc, 'Disconnection')
    const reopened = time(report.outage?.reopenedAtUtc, 'App reopen')
    const reconnected = time(report.outage?.reconnectedAtUtc, 'Reconnection')
    assert(time(b.observedStartedAtUtc, 'Second start') < disconnected && disconnected < time(b.observedStoppedAtUtc, 'Offline stop') && time(b.observedStoppedAtUtc, 'Offline stop') <= reopened && reopened < reconnected && reconnected <= time(b.receiptObservedAtUtc, 'Recovered receipt'), 'Outage must follow confirmed start; stop and app reopen must occur offline; receipt must follow reconnect.')
  }
  return { from, until }
}

export async function verifyPilotSave(report, get, { now = Date.now() } = {}) {
  const checks = [], comparisons = []
  const result = () => ({
    schemaVersion: 1, scope: report?.scope ?? null, backend: production, checkedAtUtc: utc(now),
    status: checks.every(c => c.status === 'PASS') ? report.scope === 'switch-offline' ? 'PILOT FLOW VERIFIED' : 'FIRST LAN SAVE VERIFIED' : 'NOT VERIFIED',
    limits: 'Production records were checked by read-only queries. Gateway, routing and UI behavior are operator observations, not remotely proven by these database reads. This is a bounded pilot check, not full office acceptance or five-employee clearance.',
    tolerances: { durationSeconds: durationToleranceSeconds, absoluteTimestampSeconds: timestampToleranceMs / 1000 },
    checks, comparisons,
    ...(window ? { observedRun: { startedAtUtc: report.startedAtUtc, completedAtUtc: report.completedAtUtc, gatewayCheckedAtUtc: report.gateway.checkedAtUtc },
      ...(now - window.until > 7 * 86400000 || window.from - Date.parse(report.gateway.checkedAtUtc) > 86400000 ? { notice: 'These are historical observations; they do not prove current gateway health. Preserve the evidence. Do not repeat production time writes solely to refresh this report.' } : {}) } : {}),
  })
  const check = async (id, action) => {
    try { checks.push({ id, status: 'PASS', detail: await action() }); return true }
    catch (error) { checks.push({ id, status: 'FAIL', detail: error.message }); return false }
  }
  let window
  if (!await check('evidence', () => {
    window = validateEvidence(report, now)
    return 'Required operator observations, gateway identity, exact references and independent timing supplied.'
  })) return result()
  const personId = report.person.id
  if (!await check('database.person', async () => {
    const people = await get('people', { select: 'id,email,active', email: 'eq.' + report.person.email, active: 'eq.true', limit: '2' })
    assert(people.length === 1 && people[0].id === personId && people[0].active === true && people[0].email.toLowerCase() === report.person.email.toLowerCase(), 'Email must resolve to exactly one active person with the supplied UUID.')
    return { personId, email: people[0].email }
  })) return result()
  for (const observed of report.sessions) await check('database.' + observed.kind, async () => {
    const receipts = await get('desktop_work_sessions', { select: 'id,person_id,project_id,started_at,stopped_at,entry_date,time_entry_id', id: 'eq.' + observed.sessionId, person_id: 'eq.' + personId, limit: '2' })
    assert(receipts.length === 1, 'Exact desktop receipt was not found uniquely.')
    const receipt = receipts[0]
    assert(receipt.id === observed.sessionId && receipt.person_id === personId && receipt.project_id === observed.projectId && receipt.time_entry_id === observed.timeEntryId, 'Receipt does not match exact session, employee, project and entry references.')
    const start = productionTime(receipt.started_at, 'Production start'), stop = productionTime(receipt.stopped_at, 'Production stop')
    assert(stop >= start, 'Production receipt is unfinished or has a negative duration.')
    const observedStart = time(observed.observedStartedAtUtc, 'Observed start'), observedStop = time(observed.observedStoppedAtUtc, 'Observed stop')
    assert(Math.abs(start - observedStart) <= timestampToleranceMs && Math.abs(stop - observedStop) <= timestampToleranceMs, 'Production start/stop differs from independent UTC observations by more than 15 seconds.')
    assert(stop <= time(observed.receiptObservedAtUtc, 'Receipt observation') + timestampToleranceMs, 'Agent reference was observed before the finalized session stop.')
    const seconds = (stop - start) / 1000
    assert(Math.abs(seconds - observed.observedElapsedSeconds) <= durationToleranceSeconds, 'Production duration differs from independently measured elapsed time by more than five seconds.')
    const rows = await get('time_entries', { select: 'id,person_id,project_id,date,hours,source', id: 'eq.' + observed.timeEntryId, limit: '2' })
    assert(rows.length === 1, 'Exact saved time-entry row was not found uniquely.')
    const row = rows[0]
    assert(row.id === observed.timeEntryId && row.person_id === personId && row.project_id === observed.projectId && row.source === 'windows-tracker', 'Saved entry has the wrong ID, employee, project or source.')
    assert(row.date === observed.entryDate && receipt.entry_date === observed.entryDate, 'Production date does not match observed local start date.')
    const hours = Math.round(seconds / 36) / 100
    assert(hours > 0 && Number.isFinite(Number(row.hours)) && Math.abs(Number(row.hours) - hours) < 0.000001, 'Saved hours do not match hundredth-hour rounding of the finalized duration.')
    const projects = await get('projects', { select: 'id,name,active', id: 'eq.' + observed.projectId, limit: '2' })
    assert(projects.length === 1 && projects[0].id === observed.projectId && projects[0].active === true, 'Exact project is missing or no longer active.')
    const comparison = {
      kind: observed.kind, sessionId: receipt.id, timeEntryId: row.id, personId, projectId: row.project_id, project: projects[0].name, date: row.date, hours: Number(row.hours),
      timingSource: report.timingSource, observedStartedAtUtc: observed.observedStartedAtUtc, observedStoppedAtUtc: observed.observedStoppedAtUtc, observedElapsedSeconds: observed.observedElapsedSeconds,
      productionStartedAtUtc: receipt.started_at, productionStoppedAtUtc: receipt.stopped_at, productionElapsedSeconds: seconds, differenceSeconds: seconds - observed.observedElapsedSeconds,
    }
    comparisons.push(comparison)
    return comparison
  })
  await check('database.no-extra-sessions', async () => {
    const sessions = await get('desktop_work_sessions', { select: 'id', person_id: 'eq.' + personId, started_at: 'gte.' + utc(window.from - timestampToleranceMs), and: '(started_at.lte.' + utc(window.until + timestampToleranceMs) + ')', limit: String(report.sessions.length + 1) })
    const expected = new Set(report.sessions.map(session => session.sessionId))
    assert(sessions.length === expected.size && sessions.every(session => expected.has(session.id)) && new Set(sessions.map(session => session.id)).size === expected.size, 'Unexpected or missing desktop sessions in the observed run interval.')
    return `Exactly ${expected.size} distinct desktop session(s) during the run.`
  })
  await check('database.no-unfinished-session', async () => {
    const unfinished = await get('desktop_work_sessions', { select: 'id', person_id: 'eq.' + personId, stopped_at: 'is.null', limit: '1' })
    const active = await get('active_work_sessions', { select: 'person_id,desktop_session_id', person_id: 'eq.' + personId, limit: '1' })
    assert(unfinished.length === 0 && active.length === 0, 'An unfinished desktop receipt or active timer remains. Preserve it; do not repeat the test.')
    return 'No unfinished desktop receipt or active timer at verification time.'
  })
  return result()
}

export function productionReader(env, fetchImpl = fetch) {
  assert(env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') === production, 'Refusing a non-production verification backend.')
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  assert(nonempty(key), 'Maintainer read credential unavailable; never copy it to the Windows package.')
  return async (table, filters) => {
    assert(['people', 'projects', 'desktop_work_sessions', 'time_entries', 'active_work_sessions'].includes(table), 'Read table not allowed.')
    const response = await fetchImpl(production + '/rest/v1/' + table + '?' + new URLSearchParams(filters), {
      method: 'GET', headers: { apikey: key, Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(15000), redirect: 'error',
    })
    assert(response.ok, 'Production read failed with HTTP ' + response.status)
    const rows = await response.json()
    assert(Array.isArray(rows), 'Production read returned an unexpected shape.')
    return rows
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv[2] === '--example') console.log(JSON.stringify(exampleEvidence(process.argv[3]), null, 2))
    else {
      assert(process.argv.length === 3, 'Usage: node --env-file=<private-production-env> verify-pilot-save.mjs <evidence.json>; or --example [switch-offline|first-save]')
      const file = process.argv[2], source = await readFile(file, 'utf8')
      const report = JSON.parse(source.replace(/^\uFEFF/, ''))
      const result = await verifyPilotSave(report, productionReader(process.env))
      result.evidenceSha256 = createHash('sha256').update(source).digest('hex')
      const output = file + '.pilot-verified-' + result.checkedAtUtc.replace(/[:.]/g, '-') + '.json'
      await writeFile(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' })
      console.log(JSON.stringify({ ...result, output }, null, 2))
      if (result.status === 'NOT VERIFIED') process.exitCode = 1
    }
  } catch (error) {
    console.error('NOT VERIFIED: ' + error.message)
    process.exitCode = 1
  }
}
