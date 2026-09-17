// Maintainer-only, read-only verifier. Never distribute a service-role key to IT PCs.
import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
const production = 'https://nzlajptokbcgeaifgnoq.supabase.co'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i
const assert = (condition, message) => { if (!condition) throw new Error(message) }

export async function verifyReport(report, get) {
  assert(report.SchemaVersion === 1 && report.Role === 'employee', 'Expected an employee test report.')
  assert(typeof report.Email === 'string' && report.Email.includes('@'), 'Employee email missing.')
  const checks = []
  const check = async (id, action) => {
    try { checks.push({ id, status: 'PASS', detail: await action() }) }
    catch (error) { checks.push({ id, status: 'FAIL', detail: error.message }) }
  }
  await check('employee-local-checks', async () => {
    if (['1.2.0','1.2.1'].includes(report.KitVersion)) assert(report.Phase === 'complete', 'Automatic run did not finish.')
    const required = ['account-context','installed-agent','version-and-binary','production-backend','startup-shortcut','startup-enabled','lan-settings','certificate','gateway-mutual-tls','gateway-clock','unenrolled-request-denied','diagnostics-readable','signed-in-projects','reboot-observed']
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
      if (['1.2.0','1.2.1'].includes(report.KitVersion)) assert(scenario.Observations.length >= ({ stop: 2, switch: 2, idle: 1, offline: 4 })[kind], 'Automatic behavior evidence is incomplete.')
      assert(scenario.Receipts?.length === names.length, 'Unexpected receipt count.')
      const from = new Date(scenario.StartedUtc); const until = new Date(scenario.FinishedUtc)
      assert(Number.isFinite(+from) && Number.isFinite(+until) && until > from, 'Invalid test window.')
      const receipts = await get('desktop_work_sessions', { select: 'id,person_id,project_id,started_at,stopped_at,entry_date,time_entry_id', person_id: 'eq.' + person.id, started_at: 'gte.' + from.toISOString(), and: '(started_at.lte.' + until.toISOString() + ')' })
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
        const seconds = (new Date(receipt.stopped_at) - new Date(receipt.started_at)) / 1000
        assert(seconds >= 100 && seconds <= 24 * 3600, 'Implausible duration for the two-minute-or-longer test.')
        const expectedHours = Math.round(seconds / 3600 * 100) / 100
        assert(Math.abs(Number(row.hours) - expectedHours) < 0.00001, 'Stored hours do not match finalized session duration.')
        const projects = await get('projects', { select: 'id,name', id: 'eq.' + row.project_id })
        assert(projects.length === 1 && projects[0].name === names[index], 'Saved project does not match the test project.')
        details.push({ sessionId: receipt.id, timeEntryId: row.id, project: projects[0].name, hours: row.hours, date: row.date })
      }
      return details
    })
  }
  return { computer: report.Computer, email: report.Email, checkedAt: new Date().toISOString(), backend: production, status: checks.every(c => c.status === 'PASS') ? 'EMPLOYEE CHECKS PASSED - GATEWAY REPORT AND IT SIGNOFF STILL REQUIRED' : 'NOT CLEARED', checks }
}

export function verifyGatewayReport(report) {
  const required = ['task', 'configuration', 'installed-release', 'production-internet', 'firewall', 'listener', 'certificate-and-enrollment', 'reboot-observed']
  const checks = required.map(id => ({ id: 'gateway.' + id, status: report?.Checks?.some(c => c.Id === 'gateway.' + id && c.Status === 'PASS') ? 'PASS' : 'FAIL' }))
  checks.push({ id: 'gateway.it-isolation-signoff', status: report?.Checks?.some(c => c.Id === 'gateway.isolation' && c.Status === 'OBSERVED') ? 'PASS' : 'FAIL' })
  checks.push({ id: 'gateway.complete-run', status: report?.Role === 'gateway' && ['1.2.0','1.2.1'].includes(report?.KitVersion) && report?.Phase === 'complete' && report?.Checks?.every(c => ['PASS', 'OBSERVED'].includes(c.Status)) ? 'PASS' : 'FAIL' })
  return { computer: report?.Computer, status: checks.every(c => c.status === 'PASS') ? 'PASS' : 'NOT CLEARED', checks }
}

export async function verifyOfficeReports(employee, gateway, get) {
  const local = await verifyReport(employee, get)
  const network = verifyGatewayReport(gateway)
  return { checkedAt: new Date().toISOString(), backend: production, status: local.checks.every(c => c.status === 'PASS') && network.status === 'PASS' ? 'OFFICE ACCEPTANCE CHECKS PASSED - MAINTAINER REVIEW REQUIRED BEFORE ROLLOUT' : 'NOT CLEARED', employee: local, gateway: network }
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
  assert(!['1.2.0','1.2.1'].includes(report.KitVersion) || gatewayFile, 'The automated kit requires both employee and gateway reports in one verification.')
  const result = gatewayFile ? await verifyOfficeReports(report, JSON.parse((await readFile(gatewayFile, 'utf8')).replace(/^\uFEFF/, '')), get) : await verifyReport(report, get)
  await writeFile(file + '.verified.json', JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  if (result.status === 'NOT CLEARED') process.exitCode = 1
}
