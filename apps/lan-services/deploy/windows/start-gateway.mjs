import { readFileSync } from 'node:fs'
import path from 'node:path'
import { isIP } from 'node:net'
import { createGateway } from './gateway.mjs'
import { PRODUCTION } from './security.mjs'

try {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Install supported Node.js 24 LTS first.')
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
  for (const key of ['serverKey', 'serverCertificate', 'deviceCaCertificate', 'enrolledDevices']) {
    if (typeof config[key] !== 'string' || !path.isAbsolute(config[key])) throw new Error(`Set ${key} to an absolute local file path.`)
  }
  const devices = JSON.parse(readFileSync(config.enrolledDevices, 'utf8'))
  if (!Array.isArray(devices) || devices.some(value => typeof value !== 'string' || !/^(?:[A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(value))) {
    throw new Error('enrolled-devices.json must list full uppercase SHA-256 certificate fingerprints.')
  }
  const server = createGateway({
    tls: { key: readFileSync(config.serverKey), cert: readFileSync(config.serverCertificate),
      ca: readFileSync(config.deviceCaCertificate), minVersion: 'TLSv1.2', requestCert: true, rejectUnauthorized: true },
    apiKey: apiKey.trim(), allowlistFile: config.enrolledDevices,
  })
  server.on('error', error => { console.error(`Gateway could not run: ${error.message}`); process.exitCode = 1 })
  server.listen(config.port, config.bindAddress, () => {
    console.log(`Mandala gateway listening on ${config.bindAddress}:${config.port}; backend ${PRODUCTION}`)
    console.log('Keep this window open for the pilot. Listening does not prove cloud connectivity; complete the employee save test.')
  })
} catch (error) {
  console.error(`Gateway setup needs IT: ${error.message}`)
  process.exitCode = 1
}
