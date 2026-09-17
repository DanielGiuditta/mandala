import { readFileSync, writeFileSync, renameSync } from 'node:fs'
import path from 'node:path'
import { isIP } from 'node:net'
import { createGateway } from './gateway.mjs'
import { PRODUCTION } from './security.mjs'

// Uses the existing audited gateway transport; only startup/retry/status changes.
const statusFile = process.argv[3]
function status(phase, code = '') {
  const value = { schema: 1, repairVersion: '1.0.0', utc: new Date().toISOString(), phase, code, pid: process.pid }
  try { if (statusFile) { writeFileSync(statusFile + '.tmp', JSON.stringify(value)); renameSync(statusFile + '.tmp', statusFile) } } catch { /* Protected status failures never expose configuration. */ }
  console.log('Mandala startup: ' + phase + (code ? ' (' + code + ')' : ''))
}
status('starting')
try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('The bundled runtime is unsupported. Reinstall the current Mandala Gateway.')
  const file = process.argv[2] ?? path.join(process.env.ProgramData ?? 'C:/ProgramData', 'Mandala Gateway', 'gateway.json')
  const config = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''))
  if (!isIP(config.bindAddress) || !Number.isInteger(config.port) || config.port < 1024 || config.port > 65535) {
    throw new Error('Set bindAddress to this gateway computer’s LAN IP and port to 8443.')
  }
  const apiKey = config.supabaseAnonKey
  if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.includes('REPLACE') || apiKey.startsWith('sb_secret_')) {
    throw new Error('Set the production public anonymous key. Never use a secret/service-role key.')
  }
  if (apiKey.split('.').length === 3) {
    const claims = JSON.parse(Buffer.from(apiKey.split('.')[1], 'base64url').toString())
    if (claims.role !== 'anon' || (claims.ref && claims.ref !== 'nzlajptokbcgeaifgnoq')) {
      throw new Error('The key must be the production anonymous key.')
    }
  }
  for (const key of [...(config.serverPfx ? ['serverPfx'] : ['serverKey', 'serverCertificate']), 'deviceCaCertificate', 'enrolledDevices']) {
    if (typeof config[key] !== 'string' || !path.isAbsolute(config[key])) throw new Error(`Set ${key} to an absolute local file path.`)
  }
  const devices = JSON.parse(readFileSync(config.enrolledDevices, 'utf8'))
  if (!Array.isArray(devices) || devices.some(value => typeof value !== 'string' || !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value))) {
    throw new Error('enrolled-devices.json must list full uppercase SHA-256 certificate fingerprints.')
  }
  const server = createGateway({
    tls: { ...(config.serverPfx ? { pfx: readFileSync(config.serverPfx), passphrase: config.serverPfxPassword } : { key: readFileSync(config.serverKey), cert: readFileSync(config.serverCertificate) }),
      ca: readFileSync(config.deviceCaCertificate), minVersion: 'TLSv1.2', requestCert: true, rejectUnauthorized: true },
    apiKey: apiKey.trim(), allowlistFile: config.enrolledDevices,
  })
  let retry
  function listen() {
    status('binding')
    server.listen(config.port, config.bindAddress)
  }
  server.on('error', error => {
    const code = ['EADDRNOTAVAIL','EADDRINUSE','EACCES'].includes(error.code) ? error.code : 'LISTENER_ERROR'
    status('waiting-to-retry', code)
    clearTimeout(retry)
    // The configured LAN address may arrive after boot. Keep the restricted
    // process alive and retry instead of exhausting three task restarts.
    retry = setTimeout(listen, 15000)
  })
  server.on('listening', () => {
    clearTimeout(retry)
    status('listening')
    console.log(`Mandala gateway listening on ${config.bindAddress}:${config.port}; backend ${PRODUCTION}`)
  })
  listen()
} catch (error) {
  status('failed', ['EACCES','ENOENT'].includes(error.code) ? error.code : 'CONFIG_OR_CERTIFICATE_ERROR')
  process.exitCode = 1
}
