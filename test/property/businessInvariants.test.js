import test from 'node:test'
import assert from 'node:assert/strict'
import fc from 'fast-check'
import { normalizeAccountGame, isAccountGame, ACCOUNT_GAMES } from '../../src/store/activeAccount.js'
import { normalizeLoadout, normalizeStarInventoryEntry, STAR_LOADOUT_SLOTS } from '../../src/domain/starLoadout.js'
import { retargetWorkspaceSnapshot, findLegacyHostAccount } from '../../src/pages/star/legacyHostAccountMigration.js'
import { serializeInventoryRecord, deserializeInventoryRecord, validateInventoryRecord, MAX_STAMINA_COST } from '../../src/data/inventory/exchange.js'
import { applyPlannerYield, aggregatePlannerState } from '../../src/data/cultivationPlanner.js'
import { inventoryRecordFixture } from '../../test-support/factories.js'

const options = { seed: Number(process.env.FC_SEED || 20260922), numRuns: Number(process.env.FC_RUNS || 200) }
if (!Number.isInteger(options.seed) || !Number.isInteger(options.numRuns) || options.numRuns < 1) throw new Error('FC_SEED and FC_RUNS must be integers; FC_RUNS must be positive')
console.log(`fast-check replay: FC_SEED=${options.seed} FC_RUNS=${options.numRuns}`)
const property = (...args) => fc.assert(fc.property(...args), options)
const json = fc.jsonValue()
const validId = fc.stringMatching(/^[a-z][a-z0-9_]{0,20}$/)

test('property: account game normalization is total, canonical and idempotent', () => {
  property(json, value => {
    const normalized = normalizeAccountGame(value)
    assert.ok(ACCOUNT_GAMES.includes(normalized))
    assert.equal(normalizeAccountGame(normalized), normalized)
    assert.equal(isAccountGame(normalized), true)
    assert.equal(normalized, value === '如鸢' ? '如鸢' : '代号鸢')
  })
})
test('property: star loadout normalization keeps exactly six canonical slots without mutating input', () => {
  property(fc.dictionary(fc.oneof(fc.constantFrom(...STAR_LOADOUT_SLOTS), validId), json), value => {
    const before = structuredClone(value), result = normalizeLoadout(value)
    assert.deepEqual(Object.keys(result), [...STAR_LOADOUT_SLOTS])
    assert.deepEqual(normalizeLoadout(result), result)
    assert.deepEqual(structuredClone(value), before)
    for (const v of Object.values(result)) assert.ok(v === null || (typeof v === 'string' && v.length > 0 && v === v.trim()))
  })
})
test('property: star inventory aliases converge without losing id, level or quality', () => {
  property(validId, fc.constantFrom('主星', 'main', '辅星', 'assist', 'support'), fc.integer({ min: 0, max: 100 }), (id, kind, level) => {
    const input = { instance_id: ` ${id} `, type: kind, name: ' 天府 ', level, quality: '橙' }
    const result = normalizeStarInventoryEntry(input)
    assert.equal(result.instanceId, id); assert.equal(result.level, level); assert.equal(result.quality, '橙')
    assert.equal(result.kind, ['主星', 'main'].includes(kind) ? 'main' : 'support')
    assert.deepEqual(normalizeStarInventoryEntry(result), result)
  })
})
test('property: workspace retargeting changes identity only, preserves arbitrary historical payload, and is idempotent', () => {
  property(json, fc.nat(), (payload, revision) => {
    const before = { accountId: 'legacy', revision, payload }
    const result = retargetWorkspaceSnapshot(before, 'legacy', 'canonical')
    assert.deepEqual(result, { ...before, accountId: 'canonical' })
    assert.equal(before.accountId, 'legacy')
    assert.deepEqual(retargetWorkspaceSnapshot(result, 'legacy', 'canonical'), result)
  })
})
test('property: unrelated snapshots are never retargeted', () => {
  property(json, payload => {
    const value = { accountId: 'other', payload }
    assert.equal(retargetWorkspaceSnapshot(value, 'legacy', 'canonical'), value)
  })
})
test('property: ambiguous account names never select an arbitrary legacy record', () => {
  property(fc.integer({ min: 2, max: 30 }), fc.constantFrom('如鸢', '代号鸢'), (count, gameVersion) => {
    const accounts = Array.from({ length: count }, (_, i) => ({ accountId: `legacy-${i}`, displayName: '殿下', gameVersion }))
    assert.equal(findLegacyHostAccount(accounts, { accountId: 'host', displayName: '殿下', gameVersion }), null)
    assert.equal(findLegacyHostAccount([...accounts].reverse(), { accountId: 'host', displayName: '殿下', gameVersion }), null)
  })
})
test('property: inventory wire roundtrip preserves every business field and is repeatable', () => {
  property(fc.integer({ min: 0, max: MAX_STAMINA_COST }), fc.array(fc.record({ id: validId, count: fc.integer({ min: 0, max: 1000000 }) }), { maxLength: 20 }), (staminaCost, entries) => {
    const original = inventoryRecordFixture({ staminaCost, entries })
    const before = structuredClone(original), wire = serializeInventoryRecord(original)
    assert.equal(wire.stamina_cost, staminaCost); assert.ok(!Object.hasOwn(wire, 'staminaCost'))
    assert.deepEqual(deserializeInventoryRecord(wire), original)
    assert.deepEqual(serializeInventoryRecord(wire), wire)
    assert.deepEqual(structuredClone(original), before)
  })
})
test('property: illegal stamina boundaries never pass protocol validation', () => {
  property(fc.oneof(fc.integer({ max: -1 }), fc.integer({ min: MAX_STAMINA_COST + 1, max: Number.MAX_SAFE_INTEGER }), fc.string(), fc.constant(null)), staminaCost => {
    assert.throws(() => validateInventoryRecord(inventoryRecordFixture({ staminaCost })), TypeError)
  })
})
test('property: conflicting camel/snake protocol fields are rejected instead of guessing', () => {
  property(fc.integer({ min: 0, max: MAX_STAMINA_COST - 1 }), n => {
    assert.throws(() => serializeInventoryRecord(inventoryRecordFixture({ staminaCost: n, stamina_cost: n + 1 })), /不一致/)
  })
})
test('property: planner allocation conserves resources, never makes negative needs, and does not mutate source', () => {
  property(fc.array(fc.integer({ min: 0, max: 100000 }), { minLength: 1, maxLength: 15 }), fc.integer({ min: 0, max: 2000000 }), (needs, supply) => {
    const state = Object.fromEntries(needs.map((need, i) => [`agent-${i}`, { shuijing: need }]))
    const before = structuredClone(state), result = applyPlannerYield(state, { shuijing: supply })
    assert.equal(aggregatePlannerState(result).shuijing, Math.max(0, needs.reduce((a, b) => a + b, 0) - supply))
    assert.ok(Object.values(result).every(row => row.shuijing >= 0))
    assert.deepEqual(state, before)
    assert.deepEqual(applyPlannerYield(state, { shuijing: 0 }), state)
  })
})
