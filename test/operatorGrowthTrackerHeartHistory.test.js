import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/components/operator/OperatorGrowthTracker.vue', import.meta.url), 'utf8')

test('培养卡经验与心纸摘要使用新的简洁展示口径', () => {
  assert.match(source, /experienceEtaLabel\(row\.calculation\.experienceGap\)/)
  assert.match(source, /仅刷绝境历练约 /)
  assert.doesNotMatch(source, /heartDailyAverageLabel|heartEtaLabel|heart-average/)
  assert.match(source, /heart-progress-note[^\n]*心纸[^\n]*heartGap/)
})

test('心纸展开详情提供 30 日非交互柱状图与可访问摘要', () => {
  assert.match(source, /class="heart-history" role="img" :aria-label="heartHistorySummary\(row\)"/)
  assert.match(source, /heartHasRecentAcquisition\(row\)[^\n]*class="heart-history-bars" aria-hidden="true"/)
  assert.match(source, /v-for="point in heartSeries\(row\)"/)
  assert.match(source, /近30个业务日共获得 /)
})

test('近 30 个业务日全部为零时显示明确空状态而不是空白图表', () => {
  assert.match(source, /function heartHasRecentAcquisition\(row\) \{ return Number\(heartHistoryFor\(row\)\.acquired\) > 0 \}/)
  assert.match(source, /class="heart-history-empty" aria-hidden="true">暂无心纸获取记录<\/span>/)
})

test('心纸柱状图使用可收缩的 30 等分网格避免移动端横向溢出', () => {
  assert.match(source, /\.heart-history \{[^}]*min-width: 0;[^}]*max-width: 100%;/s)
  assert.match(source, /\.heart-history-bars \{[^}]*width: 100%;[^}]*min-width: 0;[^}]*grid-template-columns: repeat\(30, minmax\(0, 1fr\)\);[^}]*overflow: hidden;/s)
  assert.match(source, /@media \(max-width: 640px\)[\s\S]*\.heart-history-bars \{[^}]*width: 100%;[^}]*min-width: 0;[^}]*overflow: hidden;[^}]*\}/)
})
