#!/usr/bin/env node
/** Offline operator preparation. No HTTP grant endpoint; dry-run is the default. */
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'
import { MongoClient, ObjectId, Long } from 'mongodb'

export class PreparationError extends Error {}
function requireValue(condition, message) { if (!condition) throw new PreparationError(message) }
const text = (value, label, max = 180) => {
  requireValue(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${label} is required (max ${max} characters).`)
  return value.trim()
}
export function validateInput(config, uidText, now = new Date()) {
  const campaignId = text(config.campaign_id, 'campaign_id')
  const snapshotId = text(config.snapshot_id, 'snapshot_id')
  requireValue(/^[a-zA-Z0-9_-]+$/.test(campaignId) && /^[a-zA-Z0-9_-]+$/.test(snapshotId), 'IDs may contain letters, digits, underscore and hyphen only.')
  const startsAt = new Date(config.starts_at)
  const snapshotAt = new Date(config.snapshot_at)
  requireValue(Number.isFinite(startsAt.getTime()) && /(?:Z|[+-]\d\d:\d\d)$/.test(config.starts_at), 'starts_at requires an explicit timezone.')
  requireValue(Number.isFinite(snapshotAt.getTime()) && /(?:Z|[+-]\d\d:\d\d)$/.test(config.snapshot_at), 'snapshot_at requires an explicit timezone.')
  requireValue(snapshotAt <= now && snapshotAt <= startsAt, 'snapshot_at must be an actual past source time, not a future snapshot.')
  const initialCapacity = config.initial_capacity ?? 100
  requireValue(Number.isInteger(initialCapacity) && initialCapacity >= 100 && initialCapacity <= 200 && initialCapacity % 4 === 0, 'initial_capacity must be 100..200 and divisible by four.')
  const timezone = text(config.announcement_timezone, 'announcement_timezone')
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(now) } catch (_) { throw new PreparationError('Invalid IANA announcement timezone.') }
  requireValue(typeof uidText === 'string' && uidText.length <= 10 * 1024 * 1024, 'UID file must be UTF-8 text, at most 10 MiB.')
  const raw = uidText.split(/\r?\n/).map(x => x.trim()).filter(Boolean)
  requireValue(raw.length > 0 && raw.every(x => x.length <= 128 && !/\s/.test(x)), 'UID file must contain one opaque UID per line, not email/password/token columns.')
  return {
    campaignId, snapshotId, startsAt, snapshotAt, initialCapacity,
    reservedInitial: initialCapacity / 4, reservedUntil: new Date(startsAt.getTime() + 72 * 3600_000),
    snapshotSourceNote: text(config.snapshot_source_note, 'snapshot_source_note', 600),
    rulesVersion: text(config.rules_version ?? 'v1', 'rules_version'), announcementTimezone: timezone,
    userIds: [...new Set(raw)], inputCount: raw.length
  }
}

export function databaseName(uri) {
  // MongoDB seed lists can contain several host:port pairs, which the WHATWG HTTP URL parser rejects.
  // Validate only the explicit database path here; MongoClient validates the complete MongoDB URI.
  try {
    const match = /^mongodb(?:\+srv)?:\/\/[^/?#]+\/([^/?#]+)(?:\?[^#]*)?$/.exec(uri)
    requireValue(match, 'Both Mongo URIs must explicitly name their database.')
    const name = decodeURIComponent(match[1])
    requireValue(name.length > 0 && !name.includes('/'), 'Both Mongo URIs must explicitly name their database.')
    return name
  } catch (error) {
    if (error instanceof PreparationError) throw error
    throw new PreparationError('Invalid Mongo URI; credentials are not printed.')
  }
}

export async function prepare(input, { hubUri, accountUri, apply = false, resume = false }) {
  requireValue(hubUri && accountUri, 'Set BETA_HUB_URI and BETA_ACCOUNT_URI; never place credentials in the JSON file.')
  const hubName = databaseName(hubUri)
  const accountName = databaseName(accountUri)
  const hubClient = new MongoClient(hubUri)
  const accountClient = new MongoClient(accountUri)
  try {
    await Promise.all([hubClient.connect(), accountClient.connect()])
    const hub = hubClient.db(hubName)
    const accounts = accountClient.db(accountName).collection('maa_user')
    const campaign = hub.collection('hub_beta_campaign')
    const snapshots = hub.collection('hub_beta_snapshot_entries')
    const existing = await campaign.findOne({ _id: input.campaignId })
    if (existing?.snapshotStatus === 'READY') {
      requireValue(existing.snapshotId === input.snapshotId, 'Snapshot is frozen; a different version cannot replace it.')
      return { mode: 'ALREADY_FROZEN_NO_CHANGES', campaign_id: input.campaignId, snapshot_id: existing.snapshotId, snapshot_count: existing.snapshotCount }
    }
    const active = []
    let missing = 0
    let inactive = 0
    for (let offset = 0; offset < input.userIds.length; offset += 400) {
      const ids = input.userIds.slice(offset, offset + 400)
      const candidates = ids.flatMap(id => /^[0-9a-f]{24}$/i.test(id) ? [id, new ObjectId(id)] : [id])
      const found = await accounts.find({ _id: { $in: candidates } }, { projection: { _id: 1, status: 1 } }).toArray()
      const byId = new Map(found.map(user => [String(user._id), user]))
      for (const id of ids) {
        const user = byId.get(id)
        if (!user) missing += 1
        else if (!(user.status > 0)) inactive += 1
        else active.push(id)
      }
    }
    const report = {
      mode: apply ? 'APPLY' : 'DRY_RUN', campaign_id: input.campaignId, snapshot_id: input.snapshotId,
      input_count: input.inputCount, unique_count: input.userIds.length, eligible_count: active.length,
      excluded_missing: missing, excluded_inactive: inactive,
      initial_capacity: input.initialCapacity, reserved_initial: input.reservedInitial,
      starts_at: input.startsAt.toISOString(), reserved_until: input.reservedUntil.toISOString()
    }
    if (!apply) return report
    requireValue(input.startsAt > new Date(), 'Preparation must finish before starts_at. Set the real postponed start time when necessary.')
    requireValue(active.length > 0, 'No valid accounts were found; nothing was written.')
    const hello = await hub.command({ hello: 1 })
    requireValue(hello.setName || hello.msg === 'isdbgrid', 'Hub Mongo must support replica-set/sharded transactions; standalone is not supported.')
    if (existing) {
      requireValue(existing.accessMode === 'CLOSED' && !existing.snapshotLockedAt && !existing.publicOpenedAt && existing.grantedCount === 0 && Number(existing.nextQueueSequence) === 0, 'Existing activity is no longer in the empty preparation stage.')
      requireValue(resume && existing.snapshotId !== input.snapshotId, 'To recover BUILDING, explicitly use --resume with a NEW snapshot_id. Frozen versions are never replaced.')
    }
    // Create collections/indexes before any transaction. Reuse exact entity Mongo field names.
    for (const name of ['hub_beta_campaign', 'hub_beta_snapshot_entries', 'hub_beta_enrollments', 'notifications', 'admin_audit_logs']) {
      if (!(await hub.listCollections({ name }).hasNext())) await hub.createCollection(name)
    }
    await snapshots.createIndex({ campaignId: 1, snapshotId: 1, userId: 1 }, { unique: true, name: 'beta_snapshot_user_unique' })
    const enrollments = hub.collection('hub_beta_enrollments')
    await enrollments.createIndex({ campaignId: 1, userId: 1 }, { unique: true, name: 'beta_user_unique' })
    await enrollments.createIndex({ campaignId: 1, status: 1, queueSequence: 1 }, { name: 'beta_queue' })
    await enrollments.createIndex({ campaignId: 1, status: 1, shareSnapshotEligible: 1, queueSequence: 1 }, { name: 'beta_reserved_queue' })
    const owner = randomUUID()
    const now = new Date()
    const document = {
      _id: input.campaignId, accessMode: 'CLOSED', publicOpenedAt: null, admissionsPaused: true, pauseReason: '尚未开放',
      startsAt: input.startsAt, reservedUntil: input.reservedUntil, initialCapacity: input.initialCapacity,
      capacity: input.initialCapacity, reservedInitial: input.reservedInitial,
      reservedRemaining: input.reservedInitial, reservedGrantedCount: 0, releasedCount: 0, releasedAt: null, grantedCount: 0,
      nextQueueSequence: Long.ZERO, allocationRevision: Long.ZERO, configVersion: Long.ZERO,
      snapshotId: input.snapshotId, snapshotStatus: 'BUILDING', snapshotAt: input.snapshotAt,
      snapshotLockedAt: null, snapshotCount: Long.ZERO, snapshotSourceNote: input.snapshotSourceNote,
      rulesVersion: input.rulesVersion, announcementTimezone: input.announcementTimezone, updatedAt: now, preparationOwner: owner
    }
    if (existing) {
      const result = await campaign.replaceOne({ _id: existing._id, snapshotStatus: 'BUILDING', snapshotId: existing.snapshotId, preparationOwner: existing.preparationOwner, allocationRevision: existing.allocationRevision }, document)
      requireValue(result.modifiedCount === 1, 'Preparation changed concurrently; no snapshot was activated.')
    } else await campaign.insertOne(document)
    for (let offset = 0; offset < active.length; offset += 400) {
      await snapshots.insertMany(active.slice(offset, offset + 400).map(userId => ({ _id: randomUUID(), campaignId: input.campaignId, snapshotId: input.snapshotId, userId, capturedAt: now })))
    }
    const session = hubClient.startSession()
    try {
      await session.withTransaction(async () => {
        requireValue(input.startsAt > new Date(), 'Start time passed during import; preparation remains BUILDING, not usable.')
        const count = await snapshots.countDocuments({ campaignId: input.campaignId, snapshotId: input.snapshotId }, { session })
        requireValue(count === active.length, 'Snapshot count mismatch; refusing to freeze.')
        const result = await campaign.updateOne(
          { _id: input.campaignId, snapshotId: input.snapshotId, preparationOwner: owner, snapshotStatus: 'BUILDING', accessMode: 'CLOSED' },
          { $set: { snapshotStatus: 'READY', snapshotLockedAt: new Date(), snapshotCount: Long.fromNumber(count), updatedAt: new Date() }, $inc: { allocationRevision: Long.ONE, configVersion: Long.ONE } }, { session }
        )
        requireValue(result.modifiedCount === 1, 'Preparation ownership changed; refusing to activate a stale snapshot.')
      })
    } finally { await session.endSession() }
    return { ...report, mode: 'FROZEN_CLOSED', snapshot_count: active.length }
  } finally { await Promise.all([hubClient.close(), accountClient.close()]) }
}

async function main() {
  const args = process.argv.slice(2)
  const value = flag => { const i = args.indexOf(flag); requireValue(i >= 0 && args[i + 1] && !args[i + 1].startsWith('--'), `Usage: node prepare.mjs --config <json> --uids <txt> [--apply] [--resume]`); return args[i + 1] }
  const input = validateInput(JSON.parse(await readFile(value('--config'), 'utf8')), await readFile(value('--uids'), 'utf8'))
  const report = await prepare(input, { hubUri: process.env.BETA_HUB_URI, accountUri: process.env.BETA_ACCOUNT_URI, apply: args.includes('--apply'), resume: args.includes('--resume') })
  console.log(JSON.stringify(report, null, 2))
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(error instanceof PreparationError ? error.message : `Preparation failed (${error.name}); check inputs, database connectivity and permissions. Credentials and user lists are not printed.`)
    process.exitCode = 1
  })
}
