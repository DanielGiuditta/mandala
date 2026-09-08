import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { X509Certificate } from 'node:crypto'
import https from 'node:https'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

test('packaged Windows launcher serves enrolled TLS health and refuses unapproved devices', { timeout: 60000, skip: !process.env.MANDALA_GATEWAY_PACKAGE && "Run the packaged launcher check with MANDALA_GATEWAY_PACKAGE set." }, async () => {
  const packageDirectory = process.env.MANDALA_GATEWAY_PACKAGE
  assert.ok(packageDirectory, 'Extract the public Windows gateway ZIP and set MANDALA_GATEWAY_PACKAGE to its directory.')
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mandala windows test '))
  const run = (...args) => execFileSync('openssl', args, { cwd: directory, stdio: 'ignore' })
  let child
  let output = ''
  try {
    run('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '1', '-subj', '/CN=Test CA')
    for (const kind of ['server', 'client']) {
      run('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${kind}.key`, '-out', `${kind}.csr`, '-subj', `/CN=${kind}`)
      writeFileSync(path.join(directory, `${kind}.ext`), kind === 'server' ? 'subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' : 'extendedKeyUsage=clientAuth\n')
      run('x509', '-req', '-in', `${kind}.csr`, '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', `${kind}.crt`, '-days', '1', '-extfile', `${kind}.ext`)
    }
    const read = file => readFileSync(path.join(directory, file))
    const devices = path.join(directory, 'devices.json')
    writeFileSync(devices, JSON.stringify([new X509Certificate(read('client.crt')).fingerprint256]))
    const reservation = net.createServer()
    await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve))
    const port = reservation.address().port
    await new Promise(resolve => reservation.close(resolve))
    const configFile = path.join(directory, 'gateway config.json')
    writeFileSync(configFile, JSON.stringify({ bindAddress: '127.0.0.1', port, supabaseAnonKey: 'test-public-key',
      serverKey: path.join(directory, 'server.key'), serverCertificate: path.join(directory, 'server.crt'),
      deviceCaCertificate: path.join(directory, 'ca.crt'), enrolledDevices: devices }))
    const launchEnvironment = { ...process.env }
    if (process.platform === 'win32') {
      for (const key of Object.keys(launchEnvironment)) if (key.toLowerCase() === 'path') delete launchEnvironment[key]
      launchEnvironment.Path = path.join(process.env.SystemRoot, 'System32')
    }
    child = process.platform === 'win32'
      ? spawn('cmd.exe', ['/d', '/s', '/c', `""${path.join(packageDirectory, 'start-gateway.cmd')}" "${configFile}""`], { windowsVerbatimArguments: true, env: launchEnvironment, stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn(process.execPath, [path.join(packageDirectory, 'start-gateway.mjs'), configFile], { stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', value => { output += value })
    child.stderr.on('data', value => { output += value })
    for (let i = 0; i < 100 && !output.includes('gateway listening') && child.exitCode === null; i++) await delay(100)
    assert.match(output, /gateway listening/, output)
    const request = (certificate = true, url = '/health') => new Promise((resolve, reject) => {
      const req = https.request({ hostname: '127.0.0.1', port, path: url, agent: false, ca: read('ca.crt'),
        ...(certificate ? { key: read('client.key'), cert: read('client.crt') } : {}), timeout: 3000 }, res => {
        const chunks = []; res.on('data', chunk => chunks.push(chunk)); res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }))
      })
      req.on('timeout', () => req.destroy(new Error('health timeout'))); req.on('error', reject); req.end()
    })
    const health = await request()
    assert.equal(health.status, 200)
    assert.equal(JSON.parse(health.body).backend, 'https://nzlajptokbcgeaifgnoq.supabase.co')
    await assert.rejects(request(false))
    assert.equal((await request(true, '/rest/v1/people')).status, 404)
    writeFileSync(devices, '[]')
    assert.equal((await request()).status, 403)
  } finally {
    if (child && child.exitCode === null) {
      if (process.platform === 'win32') execFileSync('taskkill.exe', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' })
      else child.kill()
      await delay(200)
    }
    await rm(directory, { recursive: true, force: true })
  }
})
