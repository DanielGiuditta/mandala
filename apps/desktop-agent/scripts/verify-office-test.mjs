// Maintainer-only, read-only verifier. Never distribute a service-role key to IT PCs.
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const production = 'https://nzlajptokbcgeaifgnoq.supabase.co'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const assert = (condition, message) => { if (!condition) throw new Error(message) }
const currentKit = '1.2.4'
const supportedKits = new Set(['1.1.0', '1.2.0', '1.2.1', '1.2.2', currentKit])
const automaticKit = version => supportedKits.has(version) && version !== '1.1.0'
const timestamp = (value, label) => {
  const result = typeof value === 'string' && value ? Date.parse(value) : NaN
  assert(Number.isFinite(result), `${label} is missing or invalid.`)
  return result
}
const origin = value => {
  let parsed
  try { parsed = new URL(value) } catch { throw new Error('Gateway origin is missing or invalid.') }
  assert(parsed.protocol === 'https:' && parsed.pathname === '/' && !parsed.username && !parsed.password && !parsed.search && !parsed.hash, 'Expected a plain HTTPS gateway origin.')
  return parsed.origin
}
const localDate = (utc, offsetMinutes) => new Date(utc + offsetMinutes * 60000).toISOString().slice(0, 10)
const serverClockMarginMs = 30000

export async function verifyReport(report, get) {
  assert(report.SchemaVersion === 1 && report.Role === 'employee', 'Expected an employee test report.')
  assert(typeof report.Email === 'string' && report.Email.includes('@'), 'Employee email missing.')
  const checks = []
  const check = async (id, action) => {
    try { checks.push({ id, status: 'PASS', detail: await action() }) }
    catch (error) { checks.push({ id, status: 'FAIL', detail: error.message }) }
  }
  await check('employee-local-checks', async () => {
    assert(supportedKits.has(report.KitVersion), 'Unsupported or missing test kit version; no acceptance can be inferred.')
    if (automaticKit(report.KitVersion)) assert(report.Phase === 'complete', 'Automatic run did not finish.')
    assert(typeof report.ProjectA === 'string' && report.ProjectA && typeof report.ProjectB === 'string' && report.ProjectB && report.ProjectA !== report.ProjectB, 'Two different test projects are required.')
    if (report.KitVersion === currentKit) {
      assert(!report.PrimaryError && !(report.CheckpointErrors?.length), 'Unresolved operation or checkpoint failure remains.')
      const started = timestamp(report.StartedUtc, 'Employee run start')
      const verified = timestamp(report.GatewayVerifiedUtc, 'Employee gateway verification')
      const completed = timestamp(report.CompletedUtc, 'Employee run completion')
      assert(started <= verified && verified <= completed, 'Employee verification timestamps are out of order.')
      origin(report.GatewayOrigin)
      assert(/^[a-f0-9]{64}$/i.test(report.GatewayCertificateSha256 ?? ''), 'Validated gateway certificate fingerprint is missing.')
    }
    const required = ['account-context','installed-agent','version-and-binary','production-backend','startup-shortcut','startup-enabled','lan-settings','certificate','gateway-mutual-tls','gateway-clock','unenrolled-request-denied','diagnostics-readable','signed-in-projects','reboot-observed']
    if (report.KitVersion === currentKit) required.push('direct-production-blocked')
    assert(required.every(id => report.Checks?.some(c => c.Id === 'employee.' + id && c.Status === 'PASS')), 'Not every required employee check passed.')
    assert(report.Checks.every(c => c.Status === 'PASS'), 'A failed or blocked local check remains.')
    return 'All required employee checks passed.'
  })
  const people = await get('people', { select: 'id,email,active', email: 'eq.' + report.Email, active: 'eq.true' })
  assert(people.length === 1, 'Expected exactly one active person for the reported email.')
  const person = people[0]
  const seenSessions = new Set(); const seenEntries = new Set()
  const expected = { stop: [report.ProjectA], switch: [report.ProjectA, report.ProjectB], idle: [report.ProjectA], offline: [report.ProjectA] }
  for (const [kind, names] of Object.entries(expected)) {
    await check('database.' + kind, async () => {
      const scenarios = report.Scenarios?.filter(s => s.Kind === kind) ?? []
      assert(scenarios.length === 1 && scenarios[0].Status === 'LOCAL PASS', 'Scenario was not completed successfully exactly once.')
      const scenario = scenarios[0]
      assert(scenario.Observations?.length && scenario.Observations.every(o => o.Answer === 'yes'), 'A required behavior observation is missing.')
      if (automaticKit(report.KitVersion)) assert(scenario.Observations.length >= ({ stop: 2, switch: 2, idle: 1, offline: 4 })[kind], 'Automatic behavior evidence is incomplete.')
      if (report.KitVersion === currentKit) {
        assert(scenario.Observations.every(o => typeof o.Check === 'string' && o.Check), 'Behavior observation descriptions are missing.')
        assert(new Set(scenario.Observations.map(o => o.Check)).size === scenario.Observations.length, 'Repeated observations cannot replace different behavior checks.')
      }
      assert(scenario.Receipts?.length === names.length, 'Unexpected receipt count.')
      const from = new Date(scenario.StartedUtc); const until = new Date(scenario.FinishedUtc)
      assert(Number.isFinite(+from) && Number.isFinite(+until) && until > from, 'Invalid test window.')
      if (report.KitVersion === currentKit) {
        assert(+from >= timestamp(report.GatewayVerifiedUtc, 'Employee gateway verification') && +until <= timestamp(report.CompletedUtc, 'Employee run completion'), 'Scenario is outside the verified employee run.')
        assert(Number.isInteger(scenario.TimeZoneOffsetMinutes) && Math.abs(scenario.TimeZoneOffsetMinutes) <= 14 * 60 && scenario.FinishedTimeZoneOffsetMinutes === scenario.TimeZoneOffsetMinutes, 'Scenario timezone offset is missing or changed during the test.')
      }
      for (const reported of scenario.Receipts) {
        if (reported.Utc !== undefined) {
          const observed = timestamp(reported.Utc, 'Agent receipt timestamp')
          assert(observed >= +from && observed <= +until, 'Agent receipt was observed outside its test scenario.')
        }
      }
      const ids = scenario.Receipts.map(r => r.SessionId)
      assert(ids.every(value => uuid.test(value)) && new Set(ids).size === names.length, 'Reported session references are missing, invalid or repeated.')
      // Server starts use the database clock; stops and scenario timestamps use the
      // employee clock. Query exact references so adjacent cases cannot overlap.
      const receipts = await get('desktop_work_sessions', { select: 'id,person_id,project_id,started_at,stopped_at,entry_date,time_entry_id', person_id: 'eq.' + person.id, id: 'in.(' + ids.join(',') + ')' })
      assert(receipts.length === names.length, `Expected ${names.length} database sessions in this test window; found ${receipts.length}.`)
      receipts.sort((a, b) => a.started_at.localeCompare(b.started_at))
      const details = []
      for (let index = 0; index < receipts.length; index++) {
        const receipt = receipts[index]
        assert(uuid.test(receipt.id) && uuid.test(receipt.time_entry_id ?? ''), 'Session is unfinished or has no saved time entry.')
        assert(!seenSessions.has(receipt.id) && !seenEntries.has(receipt.time_entry_id), 'A session or entry is reused across test cases.')
        seenSessions.add(receipt.id); seenEntries.add(receipt.time_entry_id)
        assert(scenario.Receipts.some(r => r.SessionId === receipt.id && r.EntryId === receipt.time_entry_id), 'Agent reference does not match the production receipt.')
        const rows = await get('time_entries', { select: 'id,person_id,project_id,date,hours,source', id: 'eq.' + receipt.time_entry_id })
        assert(rows.length === 1, 'Saved reference does not identify exactly one production row.')
        const row = rows[0]
        assert(row.person_id === person.id && row.project_id === receipt.project_id && row.date === receipt.entry_date && row.source === 'windows-tracker', 'Wrong employee, project, date or source.')
        const started = timestamp(receipt.started_at, 'Database session start')
        const stopped = timestamp(receipt.stopped_at, 'Database session stop')
        assert(started >= +from - serverClockMarginMs && stopped >= started && stopped <= +until, 'Database session start/stop falls outside its test scenario (30-second server start tolerance).')
        if (report.KitVersion === currentKit) {
          const possibleDates = [-serverClockMarginMs, 0, serverClockMarginMs].map(delta => localDate(started + delta, scenario.TimeZoneOffsetMinutes))
          assert(possibleDates.includes(receipt.entry_date), 'Saved date differs from the local date when the session started.')
        }
        const reported = scenario.Receipts.find(r => r.SessionId === receipt.id && r.EntryId === receipt.time_entry_id)
        if (reported.Utc !== undefined) assert(stopped <= timestamp(reported.Utc, 'Agent receipt timestamp'), 'Database session stops after the Agent reported its final receipt.')
        const seconds = (stopped - started) / 1000
        assert(seconds >= 90 && seconds <= 24 * 3600, 'Implausible duration for the two-minute-or-longer test, allowing at most 30 seconds of clock offset.')
        const expectedHours = Math.round(seconds / 3600 * 100) / 100
        assert(Math.abs(Number(row.hours) - expectedHours) < 0.00001, 'Stored hours do not match finalized session duration.')
        const projects = await get('projects', { select: 'id,name', id: 'eq.' + row.project_id })
        assert(projects.length === 1 && projects[0].name === names[index], 'Saved project does not match the test project.')
        details.push({ sessionId: receipt.id, timeEntryId: row.id, project: projects[0].name, hours: row.hours, date: row.date })
      }
      return details
    })
  }
  await check('database.no-extra-sessions', async () => {
    const scenarios = report.Scenarios?.filter(s => Object.hasOwn(expected, s.Kind)) ?? []
    assert(scenarios.length === 4 && scenarios.every(s => s.Status === 'LOCAL PASS'), 'All four completed scenarios are required for the full-run check.')
    const from = Math.min(...scenarios.map(s => timestamp(s.StartedUtc, 'Scenario start'))) - serverClockMarginMs
    const until = Math.max(...scenarios.map(s => timestamp(s.FinishedUtc, 'Scenario finish')))
    const expectedIds = scenarios.flatMap(s => s.Receipts?.map(r => r.SessionId) ?? [])
    assert(expectedIds.length === 5 && new Set(expectedIds).size === 5 && expectedIds.every(value => uuid.test(value)), 'Five distinct reported sessions are required.')
    // A whole-run window catches duplicate or unexpected starts without treating
    // an adjacent completed case as an extra due to a small database clock offset.
    const sessions = await get('desktop_work_sessions', { select: 'id', person_id: 'eq.' + person.id, started_at: 'gte.' + new Date(from).toISOString(), and: '(started_at.lte.' + new Date(until).toISOString() + ')' })
    assert(sessions.length === expectedIds.length && sessions.every(s => expectedIds.includes(s.id)), 'Unexpected or missing database sessions across the full test run.')
    return 'Exactly five sessions across the complete test interval; no unreported starts.'
  })
  return { computer: report.Computer, email: report.Email, checkedAt: new Date().toISOString(), backend: production, status: checks.every(c => c.status === 'PASS') ? 'EMPLOYEE CHECKS PASSED - GATEWAY REPORT AND IT SIGNOFF STILL REQUIRED' : 'NOT CLEARED', checks }
}

export function verifyGatewayReport(report) {
  const required = ['task', 'configuration', 'installed-release', 'production-internet', 'firewall', 'listener', 'certificate-and-enrollment', 'reboot-observed']
  if (report?.KitVersion === currentKit) required.push('startup-configuration', 'production-clock')
  const checks = required.map(id => ({ id: 'gateway.' + id, status: report?.Checks?.some(c => c.Id === 'gateway.' + id && c.Status === 'PASS') ? 'PASS' : 'FAIL' }))
  checks.push({ id: 'gateway.it-isolation-signoff', status: report?.Checks?.some(c => c.Id === 'gateway.isolation' && c.Status === 'OBSERVED') ? 'PASS' : 'FAIL' })
  checks.push({ id: 'gateway.complete-run', status: report?.SchemaVersion === 1 && report?.Role === 'gateway' && automaticKit(report?.KitVersion) && report?.Phase === 'complete' && report?.Checks?.every(c => ['PASS', 'OBSERVED'].includes(c.Status)) ? 'PASS' : 'FAIL' })
  return { computer: report?.Computer, status: checks.every(c => c.status === 'PASS') ? 'PASS' : 'NOT CLEARED', checks }
}

export async function verifyOfficeReports(employee, gateway, get, { now = Date.now() } = {}) {
  const local = await verifyReport(employee, get)
  const network = verifyGatewayReport(gateway)
  const checks = []
  try {
    assert(!gateway.PrimaryError && !(gateway.CheckpointErrors?.length), 'Unresolved gateway operation or checkpoint failure remains.')
    assert(employee.KitVersion === currentKit && gateway.KitVersion === currentKit, 'Current office acceptance requires both reports from kit ' + currentKit + '; preserve older time evidence for maintainer review, do not repeat it automatically.')
    assert(origin(employee.GatewayOrigin) === origin(gateway.GatewayOrigin), 'Employee and gateway reports identify different gateway addresses.')
    assert(/^[a-f0-9]{64}$/i.test(gateway.GatewayCertificateSha256 ?? '') && gateway.GatewayCertificateSha256.toLowerCase() === employee.GatewayCertificateSha256?.toLowerCase(), 'Employee TLS connection and gateway report identify different server certificates.')
    const gatewayStarted = timestamp(gateway.StartedUtc, 'Gateway run start')
    const gatewayCompleted = timestamp(gateway.CompletedUtc, 'Gateway run completion')
    const verified = timestamp(employee.GatewayVerifiedUtc, 'Employee gateway verification')
    const completed = timestamp(employee.CompletedUtc, 'Employee run completion')
    assert(gatewayStarted <= gatewayCompleted && gatewayCompleted <= verified && verified <= completed, 'Gateway acceptance must complete before employee verification and time tests.')
    assert(gatewayCompleted >= now - 7 * 24 * 3600000 && completed <= now + 30000, 'Reports are stale or dated in the future; maintainer review is required.')
    checks.push({ id: 'office.report-correlation', status: 'PASS', detail: 'Same gateway address and server certificate; current reports; gateway validation preceded employee tests; evidence is no more than seven days old.' })
  } catch (error) { checks.push({ id: 'office.report-correlation', status: 'FAIL', detail: error.message }) }
  return { checkedAt: new Date(now).toISOString(), backend: production, status: local.checks.every(c => c.status === 'PASS') && network.status === 'PASS' && checks.every(c => c.status === 'PASS') ? 'OFFICE ACCEPTANCE CHECKS PASSED - MAINTAINER REVIEW REQUIRED BEFORE ROLLOUT' : 'NOT CLEARED', checks, employee: local, gateway: network }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2]
  assert(file, 'Usage: node --env-file=<private-env> verify-office-test.mjs <employee-report.json> [gateway-report.json]')
  assert(process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') === production, 'Refusing non-production backend.')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  assert(key, 'Maintainer read credential unavailable. Do not put this credential in the Windows test package.')
  const report = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
  const get = async (table, filters) => {
    assert(['people','desktop_work_sessions','time_entries','projects'].includes(table), 'Read table not allowed.')
    const response = await fetch(production + '/rest/v1/' + table + '?' + new URLSearchParams(filters), { headers: { apikey: key, Authorization: 'Bearer ' + key }, signal: AbortSignal.timeout(15000), redirect: 'error' })
    assert(response.ok, 'Production read failed with HTTP ' + response.status)
    return response.json()
  }
  const gatewayFile = process.argv[3]
  assert(!automaticKit(report.KitVersion) || gatewayFile, 'The automated kit requires both employee and gateway reports in one verification.')
  const result = gatewayFile ? await verifyOfficeReports(report, JSON.parse((await readFile(gatewayFile, 'utf8')).replace(/^\uFEFF/, '')), get) : await verifyReport(report, get)
  await writeFile(file + '.verified.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  if (result.status === 'NOT CLEARED') process.exitCode = 1
}
