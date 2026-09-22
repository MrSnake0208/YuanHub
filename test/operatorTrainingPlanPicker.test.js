import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript, compileTemplate } from '@vue/compiler-sfc'

const filename = new URL('../src/components/operator/OperatorTrainingPlanPicker.vue', import.meta.url)
const source = readFileSync(filename, 'utf8')
const { descriptor, errors } = parse(source)
const script = compileScript(descriptor, { id: 'training-plan-picker-test' })
const template = compileTemplate({
  source: descriptor.template.content,
  filename: filename.pathname,
  id: 'training-plan-picker-test',
  compilerOptions: { bindingMetadata: script.bindings }
})

test('培养清单编辑器可编译并保留紧凑的三段式结构', () => {
  const styles = descriptor.styles[0].content
  assert.deepEqual(errors, [])
  assert.deepEqual(template.errors, [])
  assert.match(descriptor.template.content, /class="plan-dialog-head"[\s\S]*class="plan-dialog-body"[\s\S]*class="plan-dialog-actions"/)
  assert.match(descriptor.template.content, /class="plan-toolbar"[\s\S]*class="plan-selection-tabs"/)
  assert.match(descriptor.template.content, /v-if="filtersOpen"[^>]+class="plan-filters"/)
  assert.match(styles, /\.plan-dialog-shell \{[^}]*height: min\(720px, calc\(100dvh - 32px\)\)/)
  assert.match(styles, /\.plan-dialog-body \{[^}]*flex: 1 1 auto;/)
})

test('删除清单与醒目的名称输入框同行，并保留二次确认', () => {
  const templateText = descriptor.template.content
  const styles = descriptor.styles[0].content
  const footer = templateText.slice(templateText.indexOf('<footer'), templateText.indexOf('</footer>'))
  const nameRow = templateText.slice(templateText.indexOf('<div class="plan-name-row">'), templateText.indexOf('<div class="plan-toolbar">'))
  assert.match(nameRow, /class="plan-name-control"[\s\S]*id="plan-name-input"[\s\S]*class="plan-inline-delete"/)
  assert.match(templateText, /class="plan-delete-confirm"[^>]+role="alert"/)
  assert.doesNotMatch(footer, /删除/)
  assert.match(templateText, /<footer v-if="!confirmingDelete"/)
  assert.match(styles, /\.plan-inline-delete \{ width: 94px; min-width: 94px;/)
  assert.match(styles, /\.plan-toolbar \{[^}]*padding-right: 10px;/)
  assert.match(styles, /\.plan-filter-toggle \{ width: 94px; min-width: 94px;/)
  assert.match(styles, /@media \(max-width: 560px\)[\s\S]*\.plan-toolbar \{ padding-right: 8px; \}[\s\S]*\.plan-inline-delete, \.plan-filter-toggle \{ width: 88px; min-width: 88px; \}/)
})

test('搜索提示覆盖拼音和首字母，移动端候选区按最小宽度自动换行', () => {
  assert.match(descriptor.template.content, /placeholder="搜索密探、拼音或首字母"/)
  assert.match(descriptor.styles[0].content, /@media \(max-width: 560px\)[\s\S]*\.plan-candidates \{ grid-template-columns: repeat\(auto-fill, minmax\(64px, 1fr\)\)/)
})

// Replaced by mounted behavior tests; see docs/testing.md (no pixel/source-shape gate).


test('桌面端候选项以头像属性角标、职业标签和养成状态标签呈现', () => {
  const templateText = descriptor.template.content
  const styles = descriptor.styles[0].content
  assert.match(templateText, /class="plan-candidate-label profession"[^>]*>\{\{ professionLabel\(entry\) \}\}/)
  assert.match(templateText, /class="plan-candidate-label status"[^>]+growthStatus\(entry\)[\s\S]*growthStatusLabel\(entry\)/)
  assert.match(styles, /\.plan-candidate-prof \{[^}]*position: absolute;[^}]*display: block;/)
  assert.match(styles, /\.plan-candidate-label\.status\.is-growing/)
  assert.match(styles, /\.plan-candidate-label\.status\.is-graduated/)
  assert.match(styles, /\.plan-candidate-label\.status\.is-inactive/)
  assert.match(styles, /\.plan-candidate-label\.status\.is-growing \{[^}]*background: #bfdcc0;[^}]*color: #315f38;/)
  assert.match(styles, /\.plan-candidate-label\.status\.is-graduated \{[^}]*background: color-mix\(in srgb, var\(--yellow\) 35%, var\(--surface\)\);/)
})

// Replaced by mounted behavior tests; see docs/testing.md (no pixel/source-shape gate).


test('紧凑筛选控件保留原生语义和可访问状态', () => {
  const templateText = descriptor.template.content
  assert.match(templateText, /aria-controls="plan-advanced-filters"/)
  assert.match(templateText, /:aria-expanded="filtersOpen"/)
  assert.match(templateText, /role="group" aria-label="按清单状态筛选"/)
  assert.match(templateText, /:aria-pressed="selectionFilter === option.value"/)
})

test('清单切换使用自绘菜单而非浏览器原生 select', () => {
  const templateText = descriptor.template.content
  const styles = descriptor.styles[0].content
  assert.doesNotMatch(templateText, /<select[^>]+切换培养计划/)
  assert.match(templateText, /class="plan-title-trigger"[\s\S]*aria-haspopup="menu"[\s\S]*:aria-expanded="switcherOpen"/)
  assert.match(templateText, /class="plan-switcher-menu"[^>]+role="menu"/)
  assert.match(templateText, /role="menuitemradio"[^>]+:aria-checked="plan.id === activePlan.id"/)
  assert.match(styles, /\.plan-switcher-menu \{[^}]*width: 100%;[^}]*min-width: 100%;[^}]*max-width: 100%;/)
})
