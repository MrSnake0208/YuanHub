import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { MongoClient, ObjectId } from 'mongodb'
import { validateInput, prepare, PreparationError, databaseName } from '../prepare.mjs'

function config() {
  const now = new Date()
  return {
    campaign_id: 'beta-test', snapshot_id: 'frozen-v1', starts_at: new Date(now.getTime() + 86_400_000).toISOString(),
    snapshot_at: new Date(now.getTime() - 86_400_000).toISOString(), snapshot_source_note: 'isolated synthetic Share export',
    announcement_timezone: 'Asia/Shanghai', initial_capacity: 100, rules_version: 'v1'
  }
}
test('preparation validates explicit timezones, share cohort input and immutable initial ratio', () => {
  const result = validateInput(config(), 'alpha\nalpha\nbeta\n')
  assert.deepEqual(result.userIds, ['alpha', 'beta'])
  assert.equal(result.reservedInitial, 25)
  assert.equal(result.reservedUntil - result.startsAt, 72 * 3600_000)
  assert.throws(() => validateInput({ ...config(), starts_at: '2026-10-01T20:00:00' }, 'alpha'), /timezone/)
  assert.throws(() => validateInput({ ...config(), snapshot_source_note: '' }, 'alpha'), /required/)
  assert.throws(() => validateInput({ ...config(), initial_capacity: 101 }, 'alpha'), /divisible/)
  assert.throws(() => validateInput({ ...config(), initial_capacity: 201 }, 'alpha'), /100\.\.200/)
  assert.equal(validateInput({ ...config(), initial_capacity: 200 }, 'alpha').reservedInitial, 50)
  // The removed `max_capacity` key no longer exists: stale config files are accepted and ignored,
  // and later growth is decided by the admin API, never by this initial-preparation ceiling.
  assert.equal(validateInput({ ...config(), max_capacity: 500 }, 'alpha').maxCapacity, undefined)
  assert.throws(() => validateInput(config(), 'uid password'), /opaque UID/)
  assert.throws(() => validateInput({ ...config(), announcement_timezone: 'Fake/Zone' }, 'alpha'), PreparationError)
})

test('real Mongo: dry-run does not write, freeze deduplicates valid IDs and cannot add later accounts', { skip: !process.env.BETA_TEST_MONGO_URI }, async () => {
  const suffix = randomUUID().replaceAll('-', '')
  const accountName = 'beta_test_accounts_' + suffix
  const hubName = 'beta_test_snapshot_' + suffix
  function withDb(name) { const url = new URL(process.env.BETA_TEST_MONGO_URI); url.pathname = '/' + name; return url.href }
  const client = new MongoClient(process.env.BETA_TEST_MONGO_URI)
  try {
    await client.connect()
    const id = new ObjectId()
    const users = client.db(accountName).collection('maa_user')
    await users.insertMany([{ _id: id, status: 1 }, { _id: 'disabled', status: 0 }, { _id: 'string-user', status: 1 }])
    const cfg = config()
    const input = validateInput(cfg, `${id}\n${id}\nstring-user\ndisabled\nmissing\n`)
    const opts = { accountUri: withDb(accountName), hubUri: withDb(hubName) }
    const dry = await prepare(input, opts)
    assert.equal(dry.mode, 'DRY_RUN')
    assert.equal(dry.eligible_count, 2)
    assert.equal(dry.excluded_missing, 1)
    assert.equal(dry.excluded_inactive, 1)
    assert.equal(await client.db(hubName).listCollections().hasNext(), false)
    const result = await prepare(input, { ...opts, apply: true })
    assert.equal(result.mode, 'FROZEN_CLOSED')
    const activity = await client.db(hubName).collection('hub_beta_campaign').findOne({ _id: cfg.campaign_id })
    assert.equal(activity.snapshotStatus, 'READY')
    assert.equal(activity.accessMode, 'CLOSED')
    assert.equal(activity.admissionsPaused, true)
    assert.equal(activity.grantedCount, 0)
    assert.equal(activity.reservedRemaining, 25)
    assert.equal(activity.capacity, 100)
    await users.insertOne({ _id: 'later-user', status: 1 })
    const larger = validateInput(cfg, `${id}\nstring-user\nlater-user\n`)
    assert.equal((await prepare(larger, { ...opts, apply: true })).mode, 'ALREADY_FROZEN_NO_CHANGES')
    assert.equal(await client.db(hubName).collection('hub_beta_snapshot_entries').countDocuments(), 2)
    assert.equal(await client.db(hubName).collection('hub_beta_snapshot_entries').countDocuments({ userId: 'later-user' }), 0)
    await assert.rejects(prepare({ ...larger, snapshotId: 'new-v2' }, { ...opts, apply: true, resume: true }), /frozen/)
  } finally {
    // Only explicit random test databases owned by this test are removed.
    assert.ok(accountName.startsWith('beta_test_') && hubName.startsWith('beta_test_'))
    await client.db(accountName).dropDatabase()
    await client.db(hubName).dropDatabase()
    await client.close()
  }
})

test('database extraction supports replica-set seed lists and SRV without choosing an implicit test database', () => {
  assert.equal(databaseName('mongodb://one.example.invalid:27017,two.example.invalid:27017/HubBackend?replicaSet=rs0'), 'HubBackend')
  assert.equal(databaseName('mongodb+srv://cluster.example.invalid/HubBackend'), 'HubBackend')
  assert.equal(databaseName('mongodb://127.0.0.1:27028/HubBackend?replicaSet=betaTestRs'), 'HubBackend')
  assert.throws(() => databaseName('mongodb://127.0.0.1:27028/?replicaSet=betaTestRs'), /explicitly name/)
})
