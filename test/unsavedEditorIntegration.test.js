import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const operator = readFileSync(new URL('../src/pages/operator/index.vue', import.meta.url), 'utf8')
const inventory = readFileSync(new URL('../src/pages/inventory/index.vue', import.meta.url), 'utf8')

test('密探弹窗关闭入口共用脏表单确认，保存后关闭不重复确认', () => {
  assert.match(operator, /useUnsavedChanges\(editorDirty/)
  assert.match(operator, /async function closeEditor\(\)/)
  assert.match(operator, /await confirmEditorDiscard\(\)/)
  assert.match(operator, /editBaseline\.value = submittedSignature/)
})

test('库存取消与切换页签共用脏表单确认', () => {
  assert.match(inventory, /useUnsavedChanges\(stockEditDirty/)
  assert.match(inventory, /@click="requestCancelStockEdit"/)
  assert.match(inventory, /await confirmStockDiscard\(\)/)
})
