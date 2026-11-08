import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parse, compileScript } from '@vue/compiler-sfc'
import { JSDOM } from 'jsdom'
import { plannerProgressRows, settlePlannerDay, createSpend } from '../src/data/cultivationPlanner.js'

const dom = new JSDOM('<!doctype html><html><body></body></html>')
for (const key of ['window', 'document', 'Element', 'HTMLElement', 'SVGElement', 'Node']) globalThis[key] = dom.window[key]
const { createSSRApp } = await import('vue')
const { renderToString } = await import('vue/server-renderer')
const { mount } = await import('@vue/test-utils')

const file = new URL('../src/components/operator/CultivationProgress.vue', import.meta.url)
const { descriptor } = parse(readFileSync(file, 'utf8'))
const compiled = compileScript(descriptor, { id: 'planner-progress-test', inlineTemplate: true })
const source = compiled.content.replaceAll(/from (["'])vue\1/g, 'from ' + JSON.stringify(import.meta.resolve('vue')))
const { default: Progress } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))

test('培养推进只展示材料名称、满足进度和当日产出，不展示明细', async () => {
  const initial = { a: { shuijing: 10, xinghanjing: 1 } }
  const day = { start: initial, ...settlePlannerDay(initial, { gains: [{ id: 'natural', kind: 'energy', value: 408 }], spends: [createSpend('yinyang', { stageLevel: 12 })] }) }
  const rows = plannerProgressRows(initial, initial, day).map(row => ({ ...row, name: row.id }))
  const html = await renderToString(createSSRApp(Progress, { rows, dateLabel: '9月12日' }))
  assert.match(html, /class="resource-list"/)
  assert.equal((html.match(/<article class="resource(?: complete)?"/g) || []).length, 2)
  assert.match(html, /产出.*\+60/)
  assert.match(html, /还差 <b>0/)
  assert.match(html, /aria-valuenow="100"/)
  assert.doesNotMatch(html, /resource-detail|起点库存|目标需要|当日补缺|当日富余|日末还差/)
  assert.equal(rows[0].used, 10)
  assert.equal(rows[0].surplus, 50)
  assert.doesNotMatch(html, /<header|<footer|class="source-list"|class="coverage"|class="toggle"/)
})

test('零产出材料默认收起，展开后保留全部目标材料，切换日期不重置展开状态', async () => {
  const initial = { a: { shuijing: 10, xinghanjing: 1 } }
  const day = { start: initial, ...settlePlannerDay(initial, { gains: [], spends: [] }) }
  const rows = plannerProgressRows(initial, initial, day).map(row => ({ ...row, name: row.id }))
  const wrapper = mount(Progress, { props: { rows, dateLabel: '9月12日' } })
  try {
    assert.equal(wrapper.findAll('.resource').length, 0)
    assert.equal(wrapper.get('.resource-empty').text(), '这一天没有新增材料')
    assert.equal(wrapper.find('.material-legend').exists(), false)
    const toggle = wrapper.get('.materials-toggle')
    assert.equal(toggle.text(), '查看全部 2 项材料')
    assert.equal(toggle.attributes('aria-expanded'), 'false')
    await toggle.trigger('click')
    assert.equal(toggle.text(), '收起')
    assert.equal(toggle.attributes('aria-expanded'), 'true')
    assert.equal(wrapper.findAll('.resource').length, 2)
    assert.equal(wrapper.findAll('.resource-title > b').map(item => item.text()).join(','), rows.map(item => item.name).join(','))
    assert.equal(wrapper.findAll('.resource-summary strong').every(item => item.text() === '+0'), true)
    assert.equal(wrapper.findAll('[role="progressbar"]').length, 2)
    assert.equal(wrapper.findAll('[role="progressbar"]').every(item => item.attributes('aria-valuenow') === '0'), true)
    assert.equal(wrapper.find('.material-legend').exists(), true)
    await wrapper.setProps({ dateLabel: '9月13日' })
    assert.equal(toggle.attributes('aria-expanded'), 'true')
    assert.equal(wrapper.findAll('.resource').length, 2)
    await toggle.trigger('click')
    assert.equal(toggle.attributes('aria-expanded'), 'false')
    assert.equal(wrapper.findAll('.resource').length, 0)
  } finally { wrapper.unmount() }

})

// Replaced by mounted behavior tests; see docs/testing.md (no pixel/source-shape gate).


test('仅隐藏当日开始已满足的材料，当日补满仍展示，伴随掉落仍可查看', async () => {
  const rows = [
    { id: 'old', name: '起点已满', required: 10, startRemaining: 0, remaining: 0, used: 0, produced: 5, percent: 100 },
    { id: 'today', name: '当日补满', required: 10, startRemaining: 10, remaining: 0, used: 10, produced: 10, percent: 100, icon: '/inventory-icons/items/shuijing.png' },
    { id: 'almost', name: '尚缺一点', required: 10000, startRemaining: 1, remaining: 1, used: 0, produced: 0, percent: 99 },
    { id: 'side', name: '伴随掉落', required: 0, startRemaining: 0, remaining: 0, produced: 45, percent: null }
  ]
  const html = await renderToString(createSSRApp(Progress, { rows }))
  assert.doesNotMatch(html, /起点已满/)
  assert.match(html, /当日补满/)
  assert.doesNotMatch(html, /尚缺一点/)
  assert.match(html, /伴随掉落/)
  assert.match(html, /inventory-icons\/items\/shuijing.png/)
  assert.doesNotMatch(html, /还差 <b>1/)
  assert.match(html, /查看全部 3 项材料/)
  const wrapper = mount(Progress, { props: { rows } })
  try {
    assert.equal(wrapper.findAll('.resource').length, 2)
    await wrapper.get('.materials-toggle').trigger('click')
    assert.equal(wrapper.get('.materials-toggle').attributes('aria-expanded'), 'true')
    assert.deepEqual(wrapper.findAll('.resource-title > b').map(item => item.text()), ['当日补满', '尚缺一点', '伴随掉落'])
    assert.equal(wrapper.findAll('.resource-summary')[1].get('b').text(), '1')
    assert.doesNotMatch(wrapper.text(), /起点已满/)
  } finally { wrapper.unmount() }
})
