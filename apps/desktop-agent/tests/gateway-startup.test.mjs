import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, copyFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// Exercise the shipped entry unchanged, with a deterministic server double for
// error conditions that cannot safely be produced by changing a CI host's NIC.
async function runFixture(code, invalid = false) {
  const dir = await mkdtemp(path.join(tmpdir(), 'mandala-startup-'))
  try {
    await copyFile(new URL('../scripts/office-test/gateway-repair/start-gateway-resilient.mjs', import.meta.url), path.join(dir, 'entry.mjs'))
    await writeFile(path.join(dir, 'security.mjs'), "export const PRODUCTION='https://nzlajptokbcgeaifgnoq.supabase.co'\n")
    await writeFile(path.join(dir, 'gateway.mjs'), `
      import { EventEmitter } from 'node:events';
      export function createGateway(options) {
        if (!options.tls.rejectUnauthorized || !options.tls.requestCert) throw Error('TLS disabled');
        const server = new EventEmitter(); let attempts=0;
        server.listen = () => queueMicrotask(() => {
          if (++attempts < 3) server.emit('error', Object.assign(Error('PRIVATE_ERROR_BODY'), {code:${JSON.stringify(code)}}));
          else server.emit('listening');
        });
        return server;
      }
    `)
    for (const file of ['server.pfx','ca.crt']) await writeFile(path.join(dir,file), 'fixture')
    await writeFile(path.join(dir,'devices.json'), '[]')
    const config={bindAddress:'192.168.1.58',port:8443,supabaseAnonKey:invalid?'sb_secret_PRIVATE_KEY':'public-fixture',serverPfx:path.join(dir,'server.pfx'),deviceCaCertificate:path.join(dir,'ca.crt'),enrolledDevices:path.join(dir,'devices.json')}
    await writeFile(path.join(dir,'config.json'), JSON.stringify(config))
    // Keep retry logic unchanged; shorten only its clock for a bounded unit test.
    await writeFile(path.join(dir,'clock.mjs'), 'const real=globalThis.setTimeout;globalThis.setTimeout=(fn,ms,...args)=>real(fn,Math.min(ms,5),...args);await import("./entry.mjs");')
    const result=spawnSync(process.execPath,[path.join(dir,'clock.mjs'),path.join(dir,'config.json'),path.join(dir,'status.json')],{encoding:'utf8',timeout:10000})
    assert.ifError(result.error)
    const status=JSON.parse(await readFile(path.join(dir,'status.json'),'utf8'))
    assert.doesNotMatch(result.stdout+result.stderr+JSON.stringify(status),/PRIVATE_/)
    return {result,status}
  } finally {await rm(dir,{recursive:true,force:true})}
}
for(const code of ['EADDRNOTAVAIL','EADDRINUSE','EACCES']) test('unchanged launcher retries '+code+' until address becomes available',async()=>{
  const {result,status}=await runFixture(code)
  assert.equal(result.status,0)
  assert.equal(status.phase,'listening')
  assert.equal(result.stdout.split('waiting-to-retry ('+code+')').length-1,2)
})
test('invalid gateway configuration fails without retries or credential disclosure',async()=>{
  const {result,status}=await runFixture('EADDRNOTAVAIL',true)
  assert.equal(result.status,1)
  assert.equal(status.phase,'failed')
  assert.equal(status.code,'CONFIG_OR_CERTIFICATE_ERROR')
  assert.doesNotMatch(result.stdout,/waiting-to-retry/)
})
