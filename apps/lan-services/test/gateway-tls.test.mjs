import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { X509Certificate } from 'node:crypto'
import https from 'node:https'
import os from 'node:os'
import path from 'node:path'
import { createGateway } from '../gateway.mjs'
import { PRODUCTION } from '../security.mjs'

test('HTTPS gateway requires an enrolled certificate and only forwards to production', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mandala-tls-'))
  const run = (...args) => execFileSync('openssl', args, { cwd: directory, stdio: 'ignore' })
  let server
  try {
    run('req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', 'ca.key', '-out', 'ca.crt', '-days', '1', '-subj', '/CN=Mandala Test CA')
    for (const kind of ['server', 'client']) {
      run('req', '-newkey', 'rsa:2048', '-nodes', '-keyout', `${kind}.key`, '-out', `${kind}.csr`, '-subj', `/CN=${kind}`)
      writeFileSync(path.join(directory, `${kind}.ext`), kind === 'server' ? 'subjectAltName=IP:127.0.0.1\nextendedKeyUsage=serverAuth\n' : 'extendedKeyUsage=clientAuth\n')
      run('x509', '-req', '-in', `${kind}.csr`, '-CA', 'ca.crt', '-CAkey', 'ca.key', '-CAcreateserial', '-out', `${kind}.crt`, '-days', '1', '-extfile', `${kind}.ext`)
    }
    const read = name => readFileSync(path.join(directory, name))
    const allowlistFile = path.join(directory, 'devices.json')
    writeFileSync(allowlistFile, JSON.stringify([new X509Certificate(read('client.crt')).fingerprint256]))
    const destinations = []
    server = createGateway({
      tls: { key: read('server.key'), cert: read('server.crt'), ca: read('ca.crt'), requestCert: true, rejectUnauthorized: true },
      apiKey: 'test-public-key', allowlistFile,
      upstream: async (url, options) => {
        destinations.push(url)
        assert.equal(options.redirect, 'error')
        assert.equal(options.headers.Authorization, 'Bearer test.jwt.token')
        return new Response('{"saved":true}', { status: 200 })
      },
    })
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
    const request = (url, method = 'GET', certificate = true) => new Promise((resolve, reject) => {
      const req = https.request({ hostname: '127.0.0.1', port: server.address().port, path: url, method, agent: false,
        ca: read('ca.crt'), ...(certificate ? { key: read('client.key'), cert: read('client.crt') } : {}),
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer test.jwt.token' },
      }, response => {
        const chunks = []
        response.on('data', chunk => chunks.push(chunk))
        response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString() }))
      })
      req.on('error', reject)
      req.end(method === 'POST' ? '{}' : undefined)
    })
    await assert.rejects(request('/health', 'GET', false))
    assert.equal(JSON.parse((await request('/health')).body).backend, PRODUCTION)
    assert.equal((await request('/rest/v1/rpc/finish_desktop_work_session', 'POST')).status, 200)
    assert.deepEqual(destinations, [PRODUCTION + '/rest/v1/rpc/finish_desktop_work_session'])
    assert.equal((await request('/rest/v1/people', 'POST')).status, 404)
    writeFileSync(allowlistFile, '[]')
    assert.equal((await request('/health')).status, 403)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    await rm(directory, { recursive: true, force: true })
  }
})
