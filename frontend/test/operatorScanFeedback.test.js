import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSource } from '../test-support/readSource.js'

const frontendOperatorPage = readSource(new URL('../src/pages/operator/index.vue', import.meta.url))

test('密探采集事件的定位、角色及动画保护（包含外部样式）', () => {
  assert.match(frontendOperatorPage, /scheduleEventRefresh/)
  assert.match(frontendOperatorPage, /scrollIntoView/)
  assert.match(frontendOperatorPage, /focusAndFlashScanOperator\(\s*data\.operator_id/)
  assert.match(frontendOperatorPage, /char_085_shizimiaosp/)
  assert.match(frontendOperatorPage, /operator-rune-ring-outer/)
  assert.match(frontendOperatorPage, /operator-rune-ripple-two/)
  assert.match(frontendOperatorPage, /@keyframes operator-rune-reveal[\s\S]*?filter: none/)
  assert.doesNotMatch(frontendOperatorPage.match(/@keyframes operator-rune-reveal[^\n]*/)?.[0] || '', /transform\s*:/)
  assert.match(frontendOperatorPage, /char_084_chendengsp/)
  assert.match(frontendOperatorPage, /operator-seed-ripple/)
  assert.match(frontendOperatorPage, /operator-seed-burst/)
  assert.match(frontendOperatorPage, /@keyframes operator-seed-reveal[\s\S]*?filter: none/)
  assert.doesNotMatch(frontendOperatorPage.match(/@keyframes operator-seed-reveal[^\n]*/)?.[0] || '', /transform\s*:/)
})
