import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSource } from '../test-support/readSource.js'

const frontendOperatorPage = readSource(new URL('../src/pages/operator/index.vue', import.meta.url))

test('密探采集事件的定位、角色及动画保护（包含外部样式）', () => {
  assert.match(frontendOperatorPage, /scheduleEventRefresh/)
  assert.match(frontendOperatorPage, /scrollIntoView/)
  assert.match(frontendOperatorPage, /focusAndFlashScanOperator\(\s*data\.operator_id/)
})
