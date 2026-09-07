import test from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign } from 'node:crypto'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { allowedRequest } from '../gateway.mjs'
import { publish, readPublished } from '../previews.mjs'
import { sha256, verifyPermit } from '../security.mjs'

const resourceId = '11111111-1111-4111-8111-111111111111'
const subject = '22222222-2222-4222-8222-222222222222'
const sourceHash = sha256('\\\\Server\\Projects\\Drawing.dwg')
test('gateway rejects arbitrary destinations, file access, alternate APIs and query smuggling', () => {
  assert.equal(allowedRequest('POST', '/auth/v1/token?grant_type=password'), true)
  assert.equal(allowedRequest('POST', '/rest/v1/rpc/finish_desktop_work_session'), true)
  for (const url of ['https://evil.example', '//evil.example', '/rest/v1/people', '/storage/v1/object/files',
    '/rest/v1/rpc/finish_desktop_work_session?redirect=http://server', '/rest/v1/rpc/../people',
    '/rest/v1/rpc/%66inish_desktop_work_session', '/auth/v1/token?grant_type=password&redirect_to=https://evil.example']) {
    assert.equal(allowedRequest('POST', url), false, url)
  }
  assert.equal(allowedRequest('GET', '/rest/v1/rpc/finish_desktop_work_session'), false)
})
test('preview permits reject forgery, expiration and wrong resource or user', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const token = data => {
    const encoded = Buffer.from(JSON.stringify(data)).toString('base64url')
    return `${encoded}.${sign(null, Buffer.from(encoded), privateKey).toString('base64url')}`
  }
  const now = 1800000000000
  const data = { aud: 'mandala-lan-preview', sub: subject, resourceId, sourceHash, exp: now / 1000 + 30 }
  assert.equal(verifyPermit(token(data), publicKey, resourceId, now).sub, subject)
  assert.throws(() => verifyPermit(token(data) + 'x', publicKey, resourceId, now))
  assert.throws(() => verifyPermit(token(data), publicKey, subject, now))
  for (const changes of [{ exp: now / 1000 }, { exp: now / 1000 + 31 }, { sub: '' }, { aud: 'other' }]) {
    assert.throws(() => verifyPermit(token({ ...data, ...changes }), publicKey, resourceId, now))
  }
})
test('published copies enforce independent viewer permission, path binding, integrity and expiry', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mandala-preview-'))
  try {
    const bytes = Buffer.from('%PDF-1.7\napproved preview')
    const metadata = await publish(root, resourceId, sourceHash, bytes, [subject])
    assert.deepEqual((await readPublished(root, resourceId, sourceHash, subject)).bytes, bytes)
    await assert.rejects(readPublished(root, resourceId, sourceHash, resourceId))
    await assert.rejects(readPublished(root, resourceId, sha256('changed path'), subject))
    await assert.rejects(readPublished(root, '../outside', sourceHash, subject))
    await assert.rejects(publish(root, resourceId, sourceHash, Buffer.from('<html>script</html>'), [subject]))
    await writeFile(path.join(root, metadata.digest), 'tampered')
    await assert.rejects(readPublished(root, resourceId, sourceHash, subject))
    await writeFile(path.join(root, metadata.digest), bytes)
    await writeFile(path.join(root, `${resourceId}.json`), JSON.stringify({ ...metadata, publishedAt: '2020-01-01' }))
    await assert.rejects(readPublished(root, resourceId, sourceHash, subject))
    await rm(path.join(root, `${resourceId}.json`))
    await symlink(path.join(root, metadata.digest), path.join(root, `${resourceId}.json`))
    await assert.rejects(readPublished(root, resourceId, sourceHash, subject))
  } finally { await rm(root, { recursive: true, force: true }) }
})
