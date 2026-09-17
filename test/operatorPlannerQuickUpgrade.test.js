import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

function read(relativePath) {
  return readFileSync(new URL('../' + relativePath, import.meta.url), 'utf8')
}

const operatorPage = read('src/pages/operator/index.vue')
const growthTracker = read('src/components/operator/OperatorGrowthTracker.vue')

test('养成规划快捷提升在当前卡片复用预览与执行交互', () => {
  assert.match(operatorPage, /:growth-action-popover-key="cardPopoverKey"/)
  assert.match(operatorPage, /:growth-action-preview="growthPreviewData"/)
  assert.match(operatorPage, /:growth-action-execute="executeGrowthAction"/)
  assert.match(growthTracker, /<OperatorGrowthActionPopover[\s\S]*?@execute="executeGrowthAction/)
  assert.match(growthTracker, /await handler\(growthActionEntry\(row\), field\)\) await loadInventory\(\)/)
})

test('养成规划快捷提升不切换到当前养成标签，材料不足状态仍可点击查看', () => {
  const handler = operatorPage.match(/async function openPlannerGrowthAction\([\s\S]*?\n}/)?.[0] || ''
  assert.match(handler, /await openGrowthAction\(entry, field, step\)/)
  assert.doesNotMatch(handler, /setTab\("current"\)/)
  assert.match(operatorPage, /disabled: cardSubmitStates\.value\[entry\.id\] === "submitting" \|\| complete/)
  assert.match(operatorPage, /className: complete \? "is-complete" : growthActionClass/)
  assert.match(operatorPage, /"在养成规划中查看" \+ fieldLabel \+ "快捷提升"/)
})

test('快捷提升结果反馈保留在养成规划卡片内', () => {
  assert.match(operatorPage, /:growth-action-notice="plannerGrowthActionNotice"/)
  assert.match(growthTracker, /class="growth-action-notice" role="status"/)
  assert.match(operatorPage, /showQuickNotice\(entry\.id, "已提升并扣除库存", 2200\);\s*return true;/)
})
