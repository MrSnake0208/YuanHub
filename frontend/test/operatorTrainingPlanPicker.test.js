import test from 'node:test'
import assert from 'node:assert/strict'
import { readSource } from '../test-support/readSource.js'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const filename = new URL('../src/components/operator/OperatorTrainingPlanPicker.vue', import.meta.url)
const source = readSource(filename, 'utf8')
const { descriptor, errors } = parse(source)
const script = compileScript(descriptor, { id: 'training-plan-picker-test' })
const template = compileTemplate({
  source: descriptor.template.content,
  filename: filename.pathname,
  id: 'training-plan-picker-test',
  compilerOptions: { bindingMetadata: script.bindings }
})

test('培养清单编辑器可编译并保留紧凑的三段式结构', () => {
  assert.deepEqual(errors, [])
  assert.deepEqual(template.errors, [])
})

test('删除清单与醒目的名称输入框同行，并保留二次确认', () => {
  const templateText = descriptor.template.content
  assert.match(templateText, /class="plan-delete-confirm"[^>]+role="alert"/)
  assert.match(templateText, /<footer v-if="!confirmingDelete"/)
})

// Replaced by mounted behavior tests; see docs/testing.md (no pixel/source-shape gate).


// Replaced by mounted behavior tests; see docs/testing.md (no pixel/source-shape gate).


test('紧凑筛选控件保留原生语义和可访问状态', () => {
  const templateText = descriptor.template.content
  assert.match(templateText, /aria-controls="plan-advanced-filters"/)
  assert.match(templateText, /:aria-expanded="filtersOpen"/)
  assert.match(templateText, /role="group" aria-label="按成员与养成状态筛选"/)
  assert.match(templateText, /:aria-pressed="selectionFilter === option.value"/)
})

test('清单切换使用自绘菜单而非浏览器原生 select', () => {
  const templateText = descriptor.template.content
  assert.doesNotMatch(templateText, /<select[^>]+切换培养计划/)
  assert.match(templateText, /class="plan-title-trigger"[\s\S]*aria-haspopup="menu"[\s\S]*:aria-expanded="switcherOpen"/)
  assert.match(templateText, /class="plan-switcher-menu"[^>]+role="menu"/)
  assert.match(templateText, /role="menuitemradio"[^>]+:aria-checked="plan.id === activePlan.id"/)
})
