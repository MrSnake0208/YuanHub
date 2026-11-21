// mongosh HubBackend --file ...   Preview by default. See docs/monorepo-operations.md before applying.
const crypto = require('node:crypto')
const apply = process.env.YUANHUB_APPLY_CREDENTIAL_MIGRATION === 'yes'
const target = process.env.YUANHUB_CREDENTIAL_DATABASE || 'HubBackend'
if (db.getName() !== target) throw new Error('Select the expected Hub database explicitly')
const key = Buffer.from(process.env.YUANHUB_OPENAPI_STORAGE_KEY || '', 'base64')
if (key.length !== 32) throw new Error('Expected 32-byte OpenAPI storage key')

const tokens = db.getCollection('open_api_token')
const counts = { encrypted: 0, legacy: 0, migrated: 0, concurrentlyChanged: 0 }
const projection = { token: 1, encryptedSecret: 1, userId: 1 }
function digest(secret) {
  return 'sha256:' + crypto.createHash('sha256').update(secret).digest('hex')
}
function aad(row) {
  const id = typeof row._id === 'string' ? row._id : row._id.toHexString()
  return Buffer.from(['yuanhub-openapi-v1', id, row.userId].join('\u0000'))
}

// Verify the supplied key against existing ciphertext before writing any legacy rows.
for (const row of tokens.find({ token: /^sha256:/ }, projection)) {
  const bytes = Buffer.from(row.encryptedSecret, 'base64')
  const cipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12))
  cipher.setAAD(aad(row))
  cipher.setAuthTag(bytes.subarray(-16))
  const secret = Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()])
  if (digest(secret) !== row.token) throw new Error('Stored digest mismatch')
  counts.encrypted++
}

for (const row of tokens.find({ token: { $not: /^sha256:/ } }, projection)) {
  if (typeof row.token !== 'string' || !row.token || typeof row.userId !== 'string') throw new Error('Invalid legacy row')
  counts.legacy++
  if (!apply) continue
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
  cipher.setAAD(aad(row))
  const encryptedSecret = Buffer.concat([iv, cipher.update(row.token, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64')
  const result = tokens.updateOne({ _id: row._id, token: row.token, userId: row.userId },
    { $set: { token: digest(row.token), encryptedSecret } })
  if (result.modifiedCount === 1) counts.migrated++
  else counts.concurrentlyChanged++
}
printjson(counts)
