import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkCalendarImportText, readCalendarImportFile, CALENDAR_IMPORT_MAX_BYTES } from '../src/data/activityCalendarImport.js'

test('导入文本支持v1和数组，拒绝格式/版本/空/数量/UTF8字节超限', () => {
  for (const value of ['[{"title":"活动"}]', '{"schema_version":1,"items":[{}]}']) assert.equal(checkCalendarImportText(value), value)
  for (const value of ['{', '[]', '{}', 'null', '{"schema_version":2,"items":[{}]}', JSON.stringify(Array.from({ length: 201 }, () => ({}))), '好'.repeat(Math.ceil(CALENDAR_IMPORT_MAX_BYTES / 3))]) assert.throws(() => checkCalendarImportText(value))
  assert.doesNotThrow(() => checkCalendarImportText(JSON.stringify(Array.from({ length: 200 }, () => ({})))))
})
test('本地文件严格UTF8含BOM，大小/后缀/读取失败有提示，不接受异常编码', async () => {
  const bytes = new TextEncoder().encode('\ufeff[{"title":"活动"}]')
  const file = { name: 'events.JSON', size: bytes.byteLength, arrayBuffer: async () => bytes.buffer }
  assert.equal(await readCalendarImportFile(file), '[{"title":"活动"}]')
  await assert.rejects(readCalendarImportFile({ ...file, name: 'events.csv' }), /\.json/)
  await assert.rejects(readCalendarImportFile({ ...file, size: CALENDAR_IMPORT_MAX_BYTES + 1 }), /1 MiB/)
  await assert.rejects(readCalendarImportFile({ ...file, arrayBuffer: async () => new Uint8Array([0xff]).buffer }), /UTF-8/)
  await assert.rejects(readCalendarImportFile({ ...file, arrayBuffer: async () => { throw new Error('unreadable') } }), /读取失败/)
})
