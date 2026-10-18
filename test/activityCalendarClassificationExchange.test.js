import test from 'node:test'
import assert from 'node:assert/strict'
import { checkClassificationText, readClassificationFile, CLASSIFICATION_MAX_BYTES } from '../src/data/activityCalendarClassificationExchange.js'
import { filterCalendarItems, calendarFilters, calendarFilterQuery } from '../src/data/activityCalendar.js'

const document = { document_type: 'activity-calendar-classification', schema_version: 1, items: [], reference_items: [] }
test('分类文件独立格式、空目录、200条以上和容量校验', () => {
  assert.equal(checkClassificationText(JSON.stringify(document)), JSON.stringify(document))
  assert.doesNotThrow(() => checkClassificationText(JSON.stringify({ ...document, items: Array(201).fill({}) })))
  assert.throws(() => checkClassificationText('{"schema_version":1,"items":[]}'), /导出全部/)
  assert.throws(() => checkClassificationText('{'), /JSON 格式/)
  assert.throws(() => checkClassificationText(JSON.stringify({ ...document, items: Array(10001).fill({}) })), /10000/)
  assert.throws(() => checkClassificationText('中'.repeat(Math.ceil(CLASSIFICATION_MAX_BYTES / 3))), /20 MiB/)
})
test('文件读取采用分类容量且拒绝坏UTF8', async () => {
  const bytes = new TextEncoder().encode(JSON.stringify(document))
  assert.equal(await readClassificationFile({ name: 'calendar.json', size: bytes.length, arrayBuffer: async () => bytes.buffer }), JSON.stringify(document))
  await assert.rejects(() => readClassificationFile({ name: 'calendar.json', size: CLASSIFICATION_MAX_BYTES + 1 }), /20 MiB/)
  await assert.rejects(() => readClassificationFile({ name: 'calendar.json', size: 1, arrayBuffer: async () => new Uint8Array([255]).buffer }), /UTF-8/)
})
test('四组展示筛选包含旧签到和家具，旧category链接保持原语义', () => {
  const values = [{ id: 'a', category: 'LOGIN' }, { id: 'b', category: 'ACTIVITY', subtype: 'LARGE_EVENT' }, { id: 'c', category: 'ACTIVITY', subtype: 'FURNITURE', subtype_detail: 'MYSTERIOUS_CAVE' }, { id: 'd', category: 'SHOP' }]
  assert.deepEqual(filterCalendarItems(values, calendarFilters({ display_group: 'ACTIVITY' })).map(v => v.id), ['a', 'b'])
  assert.deepEqual(filterCalendarItems(values, calendarFilters({ display_group: 'FURNITURE' })).map(v => v.id), ['c'])
  assert.deepEqual(filterCalendarItems(values, calendarFilters({ display_group: 'OTHER' })).map(v => v.id), ['d'])
  assert.deepEqual(filterCalendarItems(values, calendarFilters({ category: 'ACTIVITY' })).map(v => v.id), ['b', 'c'])
  assert.deepEqual(calendarFilterQuery({ category: 'LOGIN', ref: 'keep' }, { display_group: 'ACTIVITY' }), { ref: 'keep', display_group: 'ACTIVITY' })
})
