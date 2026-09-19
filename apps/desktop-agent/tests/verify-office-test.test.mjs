import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyReport, verifyGatewayReport, verifyOfficeReports } from '../scripts/verify-office-test.mjs'
const now = Date.parse('2026-09-16T13:00:00Z')
const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0')
function fixture() {
  const required = ['account-context','installed-agent','version-and-binary','production-backend','startup-shortcut','startup-enabled','lan-settings','certificate','gateway-mutual-tls','gateway-clock','unenrolled-request-denied','diagnostics-readable','signed-in-projects','reboot-observed','direct-production-blocked']
  const report = { SchemaVersion: 1, KitVersion: '1.2.3', Phase: 'complete', StartedUtc: '2026-09-16T09:00:00Z', GatewayVerifiedUtc: '2026-09-16T09:05:00Z', CompletedUtc: '2026-09-16T12:00:00Z', GatewayOrigin: 'https://192.168.1.58:8443', GatewayCertificateSha256:'a'.repeat(64), Role: 'employee', Email: 'employee@example.test', Computer: 'TEST-PC', ProjectA: 'A', ProjectB: 'B', Checks: required.map(Id => ({ Id: 'employee.' + Id, Status: 'PASS' })), Scenarios: [] }
  const sessions = []; const entries = []
  let n = 1
  for (const [kind, count] of Object.entries({stop:1,switch:2,idle:1,offline:1})) {
    const start = new Date(Date.UTC(2026,8,16,10,n*10))
    const scenario = {Kind:kind,Status:'LOCAL PASS',StartedUtc:start.toISOString(),FinishedUtc:new Date(+start+600000).toISOString(),TimeZoneOffsetMinutes:330,FinishedTimeZoneOffsetMinutes:330,Observations:Array.from({length:({stop:2,switch:2,idle:1,offline:4})[kind]},(_,i)=>({Check:kind+' observation '+i,Answer:'yes'})),Receipts:[]}
    for(let j=0;j<count;j++,n++) {
      const session={id:id(n),person_id:id(100),project_id:id(j===1?201:200),started_at:new Date(+start+j*180000+1000).toISOString(),stopped_at:new Date(+start+j*180000+121000).toISOString(),entry_date:'2026-09-16',time_entry_id:id(300+n)}
      sessions.push(session);entries.push({id:session.time_entry_id,person_id:session.person_id,project_id:session.project_id,date:session.entry_date,hours:0.03,source:'windows-tracker'})
      scenario.Receipts.push({SessionId:session.id,EntryId:session.time_entry_id,Utc:new Date(Date.parse(session.stopped_at)+1000).toISOString()})
    }
    report.Scenarios.push(scenario)
  }
  const get=async (table,f)=>{
    if(table==='people')return[{id:id(100),email:report.Email,active:true}]
    if(table==='desktop_work_sessions'){if(f.id){const ids=f.id.slice(4,-1).split(',');return sessions.filter(s=>ids.includes(s.id))}const lo=f.started_at.slice(4);const hi=f.and.slice('(started_at.lte.'.length,-1);return sessions.filter(s=>s.started_at>=lo&&s.started_at<=hi)}
    if(table==='time_entries')return entries.filter(r=>r.id===f.id.slice(3))
    if(table==='projects')return[{id:f.id.slice(3),name:f.id.slice(3)===id(201)?'B':'A'}]
    throw Error('unexpected read')
  }
  return {report,sessions,entries,get}
}
test('matches five real rows to reported sessions, employee, projects, dates and duration',async()=>{const f=fixture();const r=await verifyReport(f.report,f.get);assert.ok(r.checks.every(c=>c.status==='PASS'));assert.match(r.status,/GATEWAY REPORT.*REQUIRED/)})
for(const [name,change] of Object.entries({
  'missing row': f=>f.entries.shift(),
  'wrong employee': f=>{f.entries[0].person_id=id(999)},
  'wrong hours': f=>{f.entries[0].hours=3},
  'wrong project': f=>{f.sessions[0].project_id=id(201);f.entries[0].project_id=id(201)},
  'extra session': f=>{f.sessions.push({...f.sessions[0],id:id(888)})},
  'unresolved employee checkpoint failure': f=>{f.report.CheckpointErrors=[{Stage:'fixture'}]},
  'unresolved employee operation failure': f=>{f.report.PrimaryError={Detail:'fixture'}},
  'direct production bypass': f=>{f.report.Checks.find(c=>c.Id==='employee.direct-production-blocked').Status='FAIL'},
  'missing routing check': f=>{f.report.Checks=f.report.Checks.filter(c=>c.Id!=='employee.direct-production-blocked')},
  'missing reboot evidence': f=>{f.report.Checks=f.report.Checks.filter(c=>c.Id!=='employee.reboot-observed')},
  'incomplete scenario': f=>{f.report.Scenarios[0].Status='INCOMPLETE'},
  'wrong receipt': f=>{f.report.Scenarios[0].Receipts[0].EntryId=id(999)},
  'same wrong date in both database tables': f=>{f.sessions[0].entry_date='2026-08-01';f.entries[0].date='2026-08-01'},
  'session stop past scenario end with consistent hours': f=>{f.sessions[0].stopped_at='2026-09-16T20:10:01.000Z';f.entries[0].hours=10},
  'receipt timestamp outside scenario': f=>{f.report.Scenarios[0].Receipts[0].Utc='2026-09-16T20:00:00Z'},
  'receipt before finalized stop': f=>{f.report.Scenarios[0].Receipts[0].Utc=f.sessions[0].started_at},
  'missing timezone evidence': f=>{delete f.report.Scenarios[0].TimeZoneOffsetMinutes},
  'timezone changed during test': f=>{f.report.Scenarios[0].FinishedTimeZoneOffsetMinutes=0},
  'future kit cannot bypass complete phase': f=>{f.report.KitVersion='9.9.9';f.report.Phase='functional'},
  'missing kit cannot bypass complete phase': f=>{delete f.report.KitVersion;f.report.Phase='functional'},
  'repeated observations': f=>{f.report.Scenarios[0].Observations[1].Check=f.report.Scenarios[0].Observations[0].Check},
  'current run missing completion': f=>{delete f.report.CompletedUtc},
  'scenario before gateway verification': f=>{f.report.GatewayVerifiedUtc='2026-09-16T12:00:00Z'}
}))test('rejects '+name,async()=>{const f=fixture();change(f);const r=await verifyReport(f.report,f.get);assert.equal(r.status,'NOT CLEARED')})

function gatewayFixture() {
 return { SchemaVersion: 1, Role: 'gateway', KitVersion: '1.2.3', Phase: 'complete', Computer: 'GATEWAY-PC', StartedUtc: '2026-09-16T08:00:00Z', CompletedUtc: '2026-09-16T08:20:00Z', GatewayOrigin: 'https://192.168.1.58:8443/', GatewayCertificateSha256:'a'.repeat(64), Checks: ['task','startup-configuration','configuration','installed-release','production-internet','firewall','listener','certificate-and-enrollment','reboot-observed'].map(id => ({Id:'gateway.'+id,Status:'PASS'})).concat({Id:'gateway.isolation',Status:'OBSERVED'}) }
}
test('combined acceptance requires gateway reboot, all checks and IT isolation observation', async()=>{
 const f=fixture(); const gateway=gatewayFixture()
 assert.equal(verifyGatewayReport(gateway).status,'PASS')
 assert.match((await verifyOfficeReports(f.report,gateway,f.get,{now})).status,/CHECKS PASSED/)
 gateway.Checks=gateway.Checks.filter(c=>c.Id!=='gateway.reboot-observed')
 assert.equal((await verifyOfficeReports(f.report,gateway,f.get,{now})).status,'NOT CLEARED')
})
test('gateway cannot pass without isolation confirmation or with a hidden failure',()=>{
 const g=gatewayFixture();g.Checks=g.Checks.filter(c=>c.Id!=='gateway.isolation');assert.equal(verifyGatewayReport(g).status,'NOT CLEARED')
 const h=gatewayFixture();h.Checks.push({Id:'test.quick-runner',Status:'BLOCKED'});assert.equal(verifyGatewayReport(h).status,'NOT CLEARED')
})
test('automatic run rejects interrupted phase and missing detailed behavior evidence',async()=>{
 const f=fixture();f.report.Phase='functional'
 assert.equal((await verifyReport(f.report,f.get)).status,'NOT CLEARED')
 f.report.Phase='complete';for(const s of f.report.Scenarios)s.Observations=[{Check:'one check',Answer:'yes'}];assert.equal((await verifyReport(f.report,f.get)).status,'NOT CLEARED')
 for(const s of f.report.Scenarios) s.Observations=Array.from({length:({stop:2,switch:2,idle:1,offline:4})[s.Kind]},(_,i)=>({Check:s.Kind+' check '+i,Answer:'yes'}))
 assert.ok((await verifyReport(f.report,f.get)).checks.every(c=>c.status==='PASS'))
})

for (const [name, change] of Object.entries({
  'unrelated gateway': (e,g) => {g.Computer='ANOTHER-OFFICE';g.GatewayOrigin='https://192.168.1.59:8443'},
  'same private address with different gateway certificate': (e,g) => {g.GatewayCertificateSha256='b'.repeat(64)},
  'missing gateway certificate fingerprint': (e,g) => {delete g.GatewayCertificateSha256},
  'missing employee certificate evidence': e => {delete e.GatewayCertificateSha256},
  'missing gateway origin': (e,g) => {delete g.GatewayOrigin},
  'old kit mislabeled as complete': (e,g) => {e.KitVersion='1.2.1';g.KitVersion='1.2.1'},
  'unknown gateway version': (e,g) => {g.KitVersion='9.0.0'},
  'missing gateway schema': (e,g) => {delete g.SchemaVersion},
  'missing resilient startup check': (e,g) => {g.Checks=g.Checks.filter(c=>c.Id!=='gateway.startup-configuration')},
  'gateway validated after employee testing': (e,g) => {g.CompletedUtc='2026-09-16T12:30:00Z'},
  'stale gateway evidence': (e,g) => {g.StartedUtc='2020-01-01T00:00:00Z';g.CompletedUtc='2020-01-01T01:00:00Z'},
  'future employee evidence': e => {e.CompletedUtc='2026-09-17T12:00:00Z'},
  'gateway path instead of origin': (e,g) => {g.GatewayOrigin=e.GatewayOrigin+'/health'}
})) test('combined acceptance rejects '+name,async()=>{
  const f=fixture();const g=gatewayFixture();change(f.report,g)
  assert.equal((await verifyOfficeReports(f.report,g,f.get,{now})).status,'NOT CLEARED')
})
test('historical reports can be inspected but cannot clear a new office acceptance',async()=>{
 const f=fixture();f.report.KitVersion='1.2.1'
 const g=gatewayFixture();g.KitVersion='1.2.1'
 assert.ok((await verifyReport(f.report,f.get)).checks.every(c=>c.status==='PASS'))
 assert.equal((await verifyOfficeReports(f.report,g,f.get,{now})).status,'NOT CLEARED')
})
test('local entry date uses the employee offset rather than the UTC calendar date',async()=>{
 const f=fixture();const delta=9*3600000
 // All sessions move past midnight in India while their UTC date stays September 16.
 for(const s of f.sessions) {s.started_at=new Date(Date.parse(s.started_at)+delta).toISOString();s.stopped_at=new Date(Date.parse(s.stopped_at)+delta).toISOString();s.entry_date='2026-09-17'}
 for(const row of f.entries)row.date='2026-09-17'
 for(const s of f.report.Scenarios) {s.StartedUtc=new Date(Date.parse(s.StartedUtc)+delta).toISOString();s.FinishedUtc=new Date(Date.parse(s.FinishedUtc)+delta).toISOString();for(const r of s.Receipts)r.Utc=new Date(Date.parse(r.Utc)+delta).toISOString()}
 f.report.CompletedUtc='2026-09-16T23:00:00Z'
 assert.ok((await verifyReport(f.report,f.get)).checks.every(c=>c.status==='PASS'))
})

for (const skewSeconds of [-20, 20]) test('adjacent scenarios tolerate '+skewSeconds+' seconds of database start-clock offset',async()=>{
 const f=fixture()
 for(const s of f.sessions) {
   s.started_at=new Date(Date.parse(s.started_at)+skewSeconds*1000).toISOString()
   f.entries.find(row=>row.id===s.time_entry_id).hours=Math.round((Date.parse(s.stopped_at)-Date.parse(s.started_at))/3600000*100)/100
 }
 assert.ok((await verifyReport(f.report,f.get)).checks.every(c=>c.status==='PASS'))
})
test('unexpected session between scenarios is rejected by the full-run check',async()=>{
 const f=fixture();f.sessions.push({...f.sessions[0],id:id(998),started_at:'2026-09-16T10:35:00Z'})
 const result=await verifyReport(f.report,f.get)
 assert.equal(result.status,'NOT CLEARED')
 assert.equal(result.checks.find(c=>c.id==='database.no-extra-sessions').status,'FAIL')
})
test('a server start more than 30 seconds before its scenario is rejected',async()=>{
 const f=fixture();f.sessions[1].started_at=new Date(Date.parse(f.report.Scenarios[1].StartedUtc)-31000).toISOString()
 f.entries[1].hours=Math.round((Date.parse(f.sessions[1].stopped_at)-Date.parse(f.sessions[1].started_at))/3600000*100)/100
 assert.equal((await verifyReport(f.report,f.get)).status,'NOT CLEARED')
})

test('local date near midnight allows only the permitted 30-second server-clock boundary',async()=>{
 const f=fixture();const delta=(8*3600+20*60+5)*1000
 for(const s of f.sessions){s.started_at=new Date(Date.parse(s.started_at)+delta-20000).toISOString();s.stopped_at=new Date(Date.parse(s.stopped_at)+delta).toISOString();s.entry_date='2026-09-17'}
 for(const row of f.entries){row.date='2026-09-17';row.hours=0.04}
 for(const s of f.report.Scenarios){s.StartedUtc=new Date(Date.parse(s.StartedUtc)+delta).toISOString();s.FinishedUtc=new Date(Date.parse(s.FinishedUtc)+delta).toISOString();for(const r of s.Receipts)r.Utc=new Date(Date.parse(r.Utc)+delta).toISOString()}
 f.report.CompletedUtc='2026-09-16T23:00:00Z'
 assert.ok((await verifyReport(f.report,f.get)).checks.every(c=>c.status==='PASS'))
})

test('unresolved gateway checkpoint failure prevents clearance',async()=>{const f=fixture();const g=gatewayFixture();g.CheckpointErrors=[{Stage:'task-stopped'}];assert.equal((await verifyOfficeReports(f.report,g,f.get,{now})).status,'NOT CLEARED')})
