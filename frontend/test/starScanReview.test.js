import test from 'node:test'
import assert from 'node:assert/strict'
import { scanReviewRows, scanApplyBody, scanRemovals } from '../src/pages/star/starScanReview.js'

const star = (id = 'old') => ({ instance_id: id, kind: 'main', name: '天府', quality: 'orange', level: 20 })
const review = () => ({ report: { entries: [{ ...star(), observation_id: 'o1' }] }, state: { generation: 1, revision: 3, inventory: [star()] }, loadout_revision: 2 })
test('only a unique unchanged star is paired; duplicates and upgraded stars require review', () => {
  const value = review()
  assert.equal(scanReviewRows(value)[0].existing_instance_id, 'old')
  value.state.inventory.push(star('duplicate'))
  assert.equal(scanReviewRows(value)[0].existing_instance_id, '')
  value.state.inventory.pop(); value.report.entries[0].level = 21
  assert.equal(scanReviewRows(value)[0].existing_instance_id, '')
})
test('explicit removals and complete values required; null counts preserve prior values', () => {
  const value = review(), rows = scanReviewRows(value)
  const body = scanApplyBody(value, rows, { orange: 0, purple: '', white: null }, { current_count: null, capacity: 100 }, false)
  assert.deepEqual(body.experience, { orange: 0, purple: null, white: null })
  assert.equal(body.expected_loadout_revision, 2)
  assert.deepEqual(Object.keys(body.entries[0]).sort(), ['observation_id', 'existing_instance_id', 'kind', 'name', 'quality', 'level'].sort())
  rows[0].included = false
  assert.equal(scanRemovals(rows, value.state.inventory).length, 1)
  assert.throws(() => scanApplyBody(value, rows, {}, {}, false), /移除/)
  assert.equal(scanApplyBody(value, rows, {}, {}, true).entries.length, 0)
  rows[0].included = true; rows[0].level = ''
  assert.throws(() => scanApplyBody(value, rows, {}, {}, true), /补全/)
})
test('one existing instance cannot be assigned twice and quality limits apply', () => {
  const value = review(), rows = scanReviewRows(value)
  rows.push({ ...rows[0], observation_id: 'o2' })
  assert.throws(() => scanApplyBody(value, rows, {}, {}, true), /一次/)
  rows.pop(); rows[0].quality = 'white'; rows[0].level = 31
  assert.throws(() => scanApplyBody(value, rows, {}, {}, true), /有效等级/)
})
test('missing levels identify the original row and field even after excluding earlier entries', () => {
  const value = review(), rows = scanReviewRows(value)
  rows[0].included = false
  rows.push({ ...rows[0], observation_id: 'o2', included: true, name: '天梁', level: null })
  assert.throws(() => scanApplyBody(value, rows, {}, {}, true), error => {
    assert.match(error.message, /第 2 颗主星天梁.*有效等级/)
    assert.equal(error.observationId, 'o2')
    assert.equal(error.field, 'level')
    return true
  })
})
