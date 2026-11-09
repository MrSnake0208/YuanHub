import test from 'node:test'
import assert from 'node:assert/strict'
import { readSource } from '../test-support/readSource.js'

const source = readSource(new URL('../src/components/operator/OperatorGrowthTracker.vue', import.meta.url), 'utf8')

test('培养卡经验与心纸摘要使用新的简洁展示口径', () => {
  assert.match(source, /experienceEtaLabel\(row\.calculation\.experienceGap\)/)
  assert.match(source, /heart-progress-note[^\n]*心纸[^\n]*heartGap/)
})

test('心纸展开详情提供 30 日非交互柱状图与可访问摘要', () => {
  assert.match(source, /class="heart-history" role="img" :aria-label="heartHistorySummary\(row\)"/)
  assert.match(source, /heartHasRecentAcquisition\(row\)[^\n]*class="heart-history-bars" aria-hidden="true"/)
  assert.match(source, /v-for="point in heartSeries\(row\)"/)
})

test('近 30 个业务日全部为零时显示明确空状态而不是空白图表', () => {
  assert.match(source, /function heartHasRecentAcquisition\(row\) \{ return Number\(heartHistoryFor\(row\)\.acquired\) > 0 \}/)
})

