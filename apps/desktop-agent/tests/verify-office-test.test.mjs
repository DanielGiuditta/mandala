import test from 'node:test'
import assert from 'node:assert/strict'
import { verifyReport, verifyGatewayReport, verifyOfficeReports } from '../scripts/verify-office-test.mjs'
const id = n => '00000000-0000-0000-0000-' + String(n).padStart(12, '0')
function fixture() {
  const required = ['account-context','installed-agent','version-and-binary','production-backend','startup-shortcut','startup-enabled','lan-settings','certificate','gateway-mutual-tls','gateway-clock','unenrolled-request-denied','diagnostics-readable','signed-in-projects','reboot-observed']
  const report = { SchemaVersion: 1, Role: 'employee', Email: 'employee@example.test', Computer: 'TEST-PC', ProjectA: 'A', ProjectB: 'B', Checks: required.map(Id => ({ Id: 'employee.' + Id, Status: 'PASS' })), Scenarios: [] }
  const sessions = []; const entries = []
  let n = 1
  for (const [kind, count] of Object.entries({stop:1,switch:2,idle:1,offline:1})) {
    const start = new Date(Date.UTC(2026,8,16,10,n*10))
    const scenario = {Kind:kind,Status:'LOCAL PASS',StartedUtc:start.toISOString(),FinishedUtc:new Date(+start+600000).toISOString(),Observations:[{Answer:'yes'}],Receipts:[]}
    for(let j=0;j<count;j++,n++) {
      const session={id:id(n),person_id:id(100),project_id:id(j===1?201:200),started_at:new Date(+start+j*180000+1000).toISOString(),stopped_at:new Date(+start+j*180000+121000).toISOString(),entry_date:'2026-09-16',time_entry_id:id(300+n)}
      sessions.push(session);entries.push({id:session.time_entry_id,person_id:session.person_id,project_id:session.project_id,date:session.entry_date,hours:0.03,source:'windows-tracker'})
      scenario.Receipts.push({SessionId:session.id,EntryId:session.time_entry_id})
    }
    report.Scenarios.push(scenario)
  }
  const get=async (table,f)=>{
    if(table==='people')return[{id:id(100),email:report.Email,active:true}]
    if(table==='desktop_work_sessions'){const lo=f.started_at.slice(4);const hi=f.and.slice('(started_at.lte.'.length,-1);return sessions.filter(s=>s.started_at>=lo&&s.started_at<=hi)}
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
  'missing reboot evidence': f=>{f.report.Checks=f.report.Checks.filter(c=>c.Id!=='employee.reboot-observed')},
  'incomplete scenario': f=>{f.report.Scenarios[0].Status='INCOMPLETE'},
  'wrong receipt': f=>{f.report.Scenarios[0].Receipts[0].EntryId=id(999)}
}))test('rejects '+name,async()=>{const f=fixture();change(f);const r=await verifyReport(f.report,f.get);assert.equal(r.status,'NOT CLEARED')})

function gatewayFixture() {
 return { Role: 'gateway', KitVersion: '1.2.0', Phase: 'complete', Checks: ['task','configuration','installed-release','production-internet','firewall','listener','certificate-and-enrollment','reboot-observed'].map(id => ({Id:'gateway.'+id,Status:'PASS'})).concat({Id:'gateway.isolation',Status:'OBSERVED'}) }
}
test('combined acceptance requires gateway reboot, all checks and IT isolation observation', async()=>{
 const f=fixture(); const gateway=gatewayFixture()
 assert.equal(verifyGatewayReport(gateway).status,'PASS')
 assert.match((await verifyOfficeReports(f.report,gateway,f.get)).status,/CHECKS PASSED/)
 gateway.Checks=gateway.Checks.filter(c=>c.Id!=='gateway.reboot-observed')
 assert.equal((await verifyOfficeReports(f.report,gateway,f.get)).status,'NOT CLEARED')
})
test('gateway cannot pass without isolation confirmation or with a hidden failure',()=>{
 const g=gatewayFixture();g.Checks=g.Checks.filter(c=>c.Id!=='gateway.isolation');assert.equal(verifyGatewayReport(g).status,'NOT CLEARED')
 const h=gatewayFixture();h.Checks.push({Id:'test.quick-runner',Status:'BLOCKED'});assert.equal(verifyGatewayReport(h).status,'NOT CLEARED')
})
test('automatic run rejects interrupted phase and missing detailed behavior evidence',async()=>{
 const f=fixture();f.report.KitVersion='1.2.0';f.report.Phase='functional'
 assert.equal((await verifyReport(f.report,f.get)).status,'NOT CLEARED')
 f.report.Phase='complete';assert.equal((await verifyReport(f.report,f.get)).status,'NOT CLEARED')
 for(const s of f.report.Scenarios) s.Observations=Array.from({length:({stop:2,switch:2,idle:1,offline:4})[s.Kind]},()=>({Answer:'yes'}))
 assert.ok((await verifyReport(f.report,f.get)).checks.every(c=>c.status==='PASS'))
})
