import test from 'node:test'
import assert from 'node:assert/strict'
import { exampleEvidence, pilotGateway, production, productionReader, verifyPilotSave } from '../scripts/verify-pilot-save.mjs'

const id = number => '00000000-0000-4000-8000-' + String(number).padStart(12, '0')
const now = Date.parse('2026-10-04T12:10:00Z')
const stamp = text => '2026-10-04T' + text + 'Z'
function fixture(scope = 'switch-offline') {
  const report = exampleEvidence(scope)
  Object.assign(report, { person: { id: id(1), email: 'pilot@example.test' },
    workstation: { computer: 'STP32', windowsUser: 'stapati\\stp32', agentVersion: '1.0.16', backend: production, gatewayOrigin: pilotGateway, gatewayCertificateSha256: 'a'.repeat(64) },
    gateway: { origin: pilotGateway, certificateSha256: 'A'.repeat(64), checkedAtUtc: stamp('11:59:00'), mutualTlsPassed: true },
    startedAtUtc: stamp('11:59:50'), completedAtUtc: stamp('12:06:00'), timingSource: 'Independent phone stopwatch and Mac UTC clock',
  })
  for (const key of Object.keys(report.observations)) report.observations[key] = true
  if (scope === 'switch-offline') report.outage = { disconnectedAtUtc: stamp('12:03:00'), reopenedAtUtc: stamp('12:04:25'), reconnectedAtUtc: stamp('12:05:00') }
  report.sessions.forEach((session, index) => Object.assign(session, {
    projectId: id(index + 10), sessionId: id(index + 20), timeEntryId: id(index + 30), entryDate: '2026-10-04',
    observedStartedAtUtc: stamp(index ? '12:02:10' : '12:00:00'), observedStoppedAtUtc: stamp(index ? '12:04:10' : '12:02:00'),
    observedElapsedSeconds: 120, receiptObservedAtUtc: stamp(index ? '12:05:15' : '12:02:02'),
  }))
  const data = {
    people: [{ id: id(1), email: 'pilot@example.test', active: true }],
    projects: report.sessions.map(session => ({ id: session.projectId, name: 'Project ' + session.kind, active: true })),
    // Use actual PostgREST timestamptz format, including microseconds and +00:00.
    desktop_work_sessions: report.sessions.map(session => ({ id: session.sessionId, person_id: id(1), project_id: session.projectId, time_entry_id: session.timeEntryId, entry_date: session.entryDate,
      started_at: session.observedStartedAtUtc.replace('Z', '.000000+00:00'), stopped_at: session.observedStoppedAtUtc.replace('Z', '.000000+00:00') })),
    time_entries: report.sessions.map(session => ({ id: session.timeEntryId, person_id: id(1), project_id: session.projectId, date: session.entryDate, hours: '0.03', source: 'windows-tracker' })),
    active_work_sessions: [],
  }
  const calls = []
  const get = async (table, filters) => {
    calls.push({ table, filters })
    let rows = data[table].filter(row => Object.entries(filters).every(([key, value]) => {
      if (value.startsWith('eq.')) return String(row[key]) === value.slice(3)
      if (value === 'is.null') return row[key] == null
      if (value.startsWith('gte.')) return Date.parse(row[key]) >= Date.parse(value.slice(4))
      if (key === 'and') return Date.parse(row.started_at) <= Date.parse(value.slice('(started_at.lte.'.length, -1))
      return true
    }))
    if (filters.limit) rows = rows.slice(0, Number(filters.limit))
    return structuredClone(rows)
  }
  return { report, data, get, calls }
}

test('two observed sessions match production +00:00 receipts, exact records and independent duration', async () => {
  const f = fixture(), before = JSON.stringify(f.report)
  const result = await verifyPilotSave(f.report, f.get, { now })
  assert.equal(result.status, 'PILOT FLOW VERIFIED')
  assert.equal(result.comparisons.length, 2)
  assert.equal(result.comparisons[0].observedElapsedSeconds, 120)
  assert.equal(result.comparisons[0].productionElapsedSeconds, 120)
  assert.equal(result.comparisons[0].timingSource, f.report.timingSource)
  assert.equal(JSON.stringify(f.report), before, 'input observations must remain unchanged')
  assert.match(result.limits, /not full office acceptance/)
  assert(f.calls.every(call => Number(call.filters.limit) <= 3), 'all reads bounded')
})

test('one first save has a deliberately smaller verdict and no invented offline observations', async () => {
  const f = fixture('first-save')
  const result = await verifyPilotSave(f.report, f.get, { now })
  assert.equal(result.status, 'FIRST LAN SAVE VERIFIED')
  assert.equal(result.comparisons.length, 1)
  assert(!Object.hasOwn(f.report.observations, 'pendingWhileDisconnected'))
})

const invalidEvidence = {
  'wrong backend': f => { f.report.backend = 'https://old.supabase.co' },
  'wrong Agent backend': f => { f.report.workstation.backend = 'https://old.supabase.co' },
  'old gateway': f => { f.report.gateway.origin = 'https://192.168.1.58:8443' },
  'different employee gateway': f => { f.report.workstation.gatewayOrigin = 'https://192.168.1.58:8443' },
  'different TLS certificate': f => { f.report.workstation.gatewayCertificateSha256 = 'b'.repeat(64) },
  'missing TLS enrollment proof': f => { delete f.report.gateway.mutualTlsPassed },
  'old Agent version': f => { f.report.workstation.agentVersion = '1.0.15' },
  'missing independent timer': f => { delete f.report.timingSource },
  'missing elapsed seconds': f => { delete f.report.sessions[0].observedElapsedSeconds },
  'string rather than stopwatch number': f => { f.report.sessions[0].observedElapsedSeconds = '120' },
  'stopwatch disagrees with observed timestamps': f => { f.report.sessions[0].observedElapsedSeconds = 152 },
  'same project switch': f => { f.report.sessions[1].projectId = f.report.sessions[0].projectId },
  'repeated receipt UUID': f => { f.report.sessions[1].sessionId = f.report.sessions[0].sessionId },
  'repeated entry UUID': f => { f.report.sessions[1].timeEntryId = f.report.sessions[0].timeEntryId },
  'abbreviated UI reference': f => { f.report.sessions[0].timeEntryId = '12345678' },
  'wrong local date': f => { f.report.sessions[0].entryDate = '2026-10-03' },
  'receipt preceding stop': f => { f.report.sessions[0].receiptObservedAtUtc = stamp('12:01:59') },
  'timezone absent': f => { delete f.report.localUtcOffsetMinutes },
  'short session': f => { f.report.sessions[0].observedElapsedSeconds = 20 },
  'missing recovery time': f => { delete f.report.outage.reopenedAtUtc },
  'app reopened after reconnect': f => { f.report.outage.reopenedAtUtc = stamp('12:05:01') },
  'stopped before disconnect': f => { f.report.outage.disconnectedAtUtc = stamp('12:04:11') },
  'receipt before reconnect': f => { f.report.outage.reconnectedAtUtc = stamp('12:05:16') },
  'future completion': f => { f.report.completedAtUtc = stamp('13:00:00') },
}
for (const [label, mutate] of Object.entries(invalidEvidence)) test('rejects evidence: ' + label, async () => {
  const f = fixture(); mutate(f)
  const result = await verifyPilotSave(f.report, f.get, { now })
  assert.equal(result.status, 'NOT VERIFIED')
  assert.equal(result.checks[0].status, 'FAIL')
  assert.equal(f.calls.length, 0, 'incomplete evidence must not cause production reads')
})
for (const key of Object.keys(exampleEvidence().observations)) test('requires explicit observed success: ' + key, async () => {
  const f = fixture(); delete f.report.observations[key]
  const result = await verifyPilotSave(f.report, f.get, { now })
  assert.equal(result.status, 'NOT VERIFIED'); assert.equal(f.calls.length, 0)
})

const invalidDatabase = {
  'missing person': f => { f.data.people = [] },
  'same email different person': f => { f.data.people[0].id = id(999) },
  'duplicate email': f => { f.data.people.push({ ...f.data.people[0], id: id(999) }) },
  'wrong receipt owner': f => { f.data.desktop_work_sessions[0].person_id = id(999) },
  'wrong receipt project': f => { f.data.desktop_work_sessions[0].project_id = id(999) },
  'wrong receipt entry': f => { f.data.desktop_work_sessions[0].time_entry_id = id(999) },
  'missing entry': f => { f.data.time_entries.shift() },
  'wrong entry employee': f => { f.data.time_entries[0].person_id = id(999) },
  'wrong entry source': f => { f.data.time_entries[0].source = 'manual' },
  'wrong entry date': f => { f.data.time_entries[0].date = '2026-10-03' },
  'wrong hours': f => { f.data.time_entries[0].hours = 8 },
  'old 32-second skew despite internally matching hours': f => { f.data.desktop_work_sessions[0].stopped_at = stamp('12:01:28'); f.data.time_entries[0].hours = 0.02 },
  'six-second duration drift within absolute timestamp tolerance': f => { f.data.desktop_work_sessions[0].stopped_at = stamp('12:01:54') },
  'correct duration but wrong absolute test window': f => { f.data.desktop_work_sessions[0].started_at = stamp('11:58:00'); f.data.desktop_work_sessions[0].stopped_at = stamp('12:00:00') },
  'unfinished tested receipt': f => { f.data.desktop_work_sessions[0].stopped_at = null },
  'inactive project': f => { f.data.projects[0].active = false },
  'extra session during run': f => { f.data.desktop_work_sessions.push({ ...f.data.desktop_work_sessions[0], id: id(999) }) },
  'unfinished session outside run': f => { f.data.desktop_work_sessions.push({ ...f.data.desktop_work_sessions[0], id: id(999), started_at: stamp('11:00:00'), stopped_at: null }) },
  'active browser timer remains': f => { f.data.active_work_sessions.push({ person_id: id(1), desktop_session_id: null }) },
}
for (const [label, mutate] of Object.entries(invalidDatabase)) test('rejects production evidence: ' + label, async () => {
  const f = fixture(); mutate(f)
  const result = await verifyPilotSave(f.report, f.get, { now })
  assert.equal(result.status, 'NOT VERIFIED')
  assert(result.checks.some(check => check.id.startsWith('database.') && check.status === 'FAIL'))
})

test('read failure is reported without assuming a missing row or success', async () => {
  const f = fixture()
  const result = await verifyPilotSave(f.report, async () => { throw new Error('Production read failed with HTTP 503') }, { now })
  assert.equal(result.status, 'NOT VERIFIED')
  assert.match(result.checks[1].detail, /HTTP 503/)
})

test('empty example cannot masquerade as completed evidence', async () => {
  let called = false
  const result = await verifyPilotSave(exampleEvidence(), async () => { called = true; return [] }, { now })
  assert.equal(result.status, 'NOT VERIFIED'); assert.equal(called, false)
  assert(Object.values(exampleEvidence().observations).every(value => value === null))
})

test('delayed read-only review preserves valid historical proof and does not demand repeated writes', async () => {
  const f = fixture()
  const result = await verifyPilotSave(f.report, f.get, { now: now + 30 * 86400000 })
  assert.equal(result.status, 'PILOT FLOW VERIFIED')
  assert.match(result.notice, /Do not repeat production time writes/)
  assert.equal(result.observedRun.completedAtUtc, f.report.completedAtUtc)
})

test('reader is pinned to production, uses GET only, refuses redirects and restricts tables', async () => {
  assert.throws(() => productionReader({ NEXT_PUBLIC_SUPABASE_URL: 'https://old.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'fixture' }), /non-production/)
  assert.throws(() => productionReader({ NEXT_PUBLIC_SUPABASE_URL: production }), /credential/)
  const calls = []
  const get = productionReader({ NEXT_PUBLIC_SUPABASE_URL: production, SUPABASE_SERVICE_ROLE_KEY: 'fixture' }, async (url, options) => {
    calls.push({ url, options }); return { ok: true, json: async () => [] }
  })
  await get('people', { select: 'id', id: 'eq.' + id(1), limit: '1' })
  assert(calls[0].url.startsWith(production + '/rest/v1/people?'))
  assert.equal(calls[0].options.method, 'GET'); assert.equal(calls[0].options.redirect, 'error')
  assert(!Object.hasOwn(calls[0].options, 'body'))
  await assert.rejects(get('rpc/finish_desktop_work_session', {}), /not allowed/)
  assert.equal(calls.length, 1)
})
