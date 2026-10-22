import test from 'node:test'
import assert from 'node:assert/strict'
import { relationshipProgress, relationshipSummary, makeRelationshipBackup, readRelationshipBackup, previewRelationshipImport, parseRelationshipValue } from '../src/utils/operatorRelationships.js'
const coin = quantity => ({ item_key: 'coin', name: '测试币', quantity })
const rule = { max: 20, complete: true, milestones: [{ at: 8, rewards: [coin(20)] }, { at: 15, rewards: [coin(50)] }] }
const rules = { a: { trust_owner_id: 'a', trust: rule, rumors: rule }, sp: { trust_owner_id: 'a', trust: rule, rumors: rule } }
test('milestone boundaries, unknown and complete collection remain distinct', () => {
  assert.equal(relationshipProgress(null, rule).status, 'unknown')
  assert.equal(relationshipProgress(0, null).remaining, null)
  assert.equal(relationshipProgress(0, { ...rule, complete: false }).remaining, null)
  assert.equal(relationshipProgress(21, rule).status, 'invalid')
  assert.equal(relationshipProgress(8, rule).next.at, 15)
  assert.deepEqual(relationshipProgress(15, rule).remaining, [])
  assert.equal(relationshipProgress(0, rule).remaining.reduce((sum, x) => sum + x.quantity, 0), 70)
})
test('shared trust counted once while independent rumors and unrecorded coverage stay separate', () => {
  const result = relationshipSummary([{ id: 'a' }, { id: 'sp' }], { a: { trust: 8, rumors: 15 }, sp: { rumors: 8 } }, rules)
  assert.equal(result.rewards[0].quantity, 100)
  assert.equal(result.covered, 2)
  assert.equal(relationshipSummary([{ id: 'a' }], { a: { trust: 0 } }, rules).missing, 1)
  assert.equal(relationshipSummary([{ id: 'a' }], {}, {}).rewards.length, 0)
})
test('backup roundtrip preserves zero, rejects wrong game unknown duplicate malformed values', () => {
  const records = { a: { trust: 0, rumors: 4 } }, operators = [{ id: 'a' }]
  const document = makeRelationshipBackup('如鸢', records)
  assert.deepEqual({ ...readRelationshipBackup(JSON.stringify(document), '如鸢', operators) }, records)
  for (const changed of [ { ...document, game: '代号鸢' }, { ...document, token: 'x' }, { ...document, entries: [...document.entries, ...document.entries] }, { ...document, entries: [{ operator_id: 'bad', trust: 1 }] }, ...[null, '1', -1, 1.5, 9007199254740992].map(trust => ({ ...document, entries: [{ operator_id: 'a', trust }] })) ]) {
    assert.throws(() => readRelationshipBackup(JSON.stringify(changed), '如鸢', operators))
  }
})
test('restore defaults to preserve conflicts, has explicit overwrite, is absolute and rejects shared conflict', () => {
  const incoming = { a: { trust: 10, rumors: 3 } }, current = { a: { trust: 0 } }
  assert.deepEqual({ ...previewRelationshipImport(incoming, current, rules).entries }, { a: { rumors: 3 } })
  assert.equal(previewRelationshipImport(incoming, current, rules).conflicts, 1)
  assert.deepEqual({ ...previewRelationshipImport(incoming, current, rules, true).entries }, incoming)
  assert.equal(previewRelationshipImport(incoming, incoming, rules).changes, 0)
  assert.throws(() => previewRelationshipImport({ a: { trust: 2 }, sp: { trust: 3 } }, {}, rules))
  assert.throws(() => previewRelationshipImport({ a: { trust: 21 } }, {}, rules))
})
test('input rejects coercion and sum overflow is never displayed as a precise reward', () => {
  assert.equal(parseRelationshipValue(''), null); assert.equal(parseRelationshipValue('0'), 0)
  for (const value of ['1e2', '1.0', '-1', 'Infinity', '9007199254740992']) assert.throws(() => parseRelationshipValue(value))
  const big = { ...rule, milestones: [{ at: 1, rewards: [coin(Number.MAX_SAFE_INTEGER)] }] }
  const result = relationshipSummary([{ id: 'a' }], { a: { trust: 0, rumors: 0 } }, { a: { trust_owner_id: 'a', trust: big, rumors: big } })
  assert.equal(result.overflow, true); assert.deepEqual(result.rewards, [])
})
