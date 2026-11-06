import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { normalizeMaaYuanInventory, starImportKind } from '../src/pages/star/maayuanInventoryImport.js'

// Business-field projection of the saved real 2026-10-31 GUI OCR run (no diagnostic/personal data).
const real = () => JSON.parse(readFileSync(new URL('./fixtures/maayuan-full-inventory.json', import.meta.url), 'utf8'))
test('real complete OCR preserves all 174 positional instances and actual experience, with stable batch identity', async () => {
  const local = real(), first = await normalizeMaaYuanInventory(local)
  assert.equal(starImportKind(local), 'local-ocr')
  assert.deepEqual(first.document.counts, { main: 69, support: 105 })
  assert.equal(first.document.inventory.length, 174)
  assert.deepEqual(first.document.experience, { orange: 1, purple: 525, white: 91 })
  assert.equal(Object.hasOwn(first.document, 'bag'), false)
  assert.deepEqual(first, await normalizeMaaYuanInventory(real()))
  assert.ok(new Set(first.document.inventory.map(item => JSON.stringify(item))).size < 174, 'real duplicates stay separate')
  assert.deepEqual(Object.keys(first.document.inventory[0]), ['kind', 'name', 'quality', 'level'])
  local.sections.main.items[0].instanceId = 'local-only'
  local.sections.main.items[0].sourceImageId = 'private.png'
  assert.deepEqual(first, await normalizeMaaYuanInventory(local))
})
test('compact protocol keeps its original scan_id and strict wire body, not a backup or raw envelope', async () => {
  const { document } = await normalizeMaaYuanInventory(real())
  document.scan_id = '11111111-1111-4111-8111-111111111111'
  assert.deepEqual(await normalizeMaaYuanInventory(document), { document, source_format: 'compact' })
  assert.equal(starImportKind({ schemaVersion: 1, inventory: [] }), 'backup')
  assert.equal(starImportKind({ schemaVersion: 2, inventory: [] }), 'backup') // delegated to actual backup parser
  await assert.rejects(normalizeMaaYuanInventory({ ...document, user_id: 'foreign' }))
  await assert.rejects(normalizeMaaYuanInventory({ ...document, inventory: [{ ...document.inventory[0], instanceId: 'local' }] }))
})
test('unconfirmed counts and incomplete sections cannot be promoted to a full inventory', async () => {
  const mutations = [
    x => { x.complete = false }, x => { x.schemaVersion = 1 }, x => { delete x.complete },
    x => { x.sections.main.complete = false }, x => { x.sections.support.count++ },
    x => { x.experience.structured = false }, x => { x.experience.orangeCount = null },
    x => { x.experience.whiteCount = '0' }, x => { x.experience.whiteCount = -1 },
    x => { x.sections.main.items[0].level = 61 }, x => { x.sections.main.items[0].quality = 'gold' },
    x => { x.sections.main.items[0].section = 'support' }, x => { x.account_id = 'foreign' },
  ]
  for (const mutate of mutations) { const x = real(); mutate(x); await assert.rejects(normalizeMaaYuanInventory(x)) }
})
test('capacity is copied only from a confirmed consistent observation and never invented', async () => {
  const local = real()
  local.bag = { complete: true, currentCount: 174, capacity: 270 }
  assert.deepEqual((await normalizeMaaYuanInventory(local)).document.bag, { current_count: 174, capacity: 270 })
  local.bag.currentCount = 173
  await assert.rejects(normalizeMaaYuanInventory(local))
  local.bag = { complete: false, capacity: 999 }
  assert.deepEqual((await normalizeMaaYuanInventory(local)).document.bag, { current_count: 174, capacity: null })
})
