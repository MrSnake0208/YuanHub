import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OperatorDiscTargetModal from '../src/components/operator/OperatorDiscTargetModal.vue'
import OperatorDiscComparison from '../src/components/operator/OperatorDiscComparison.vue'

const catalog = ['A', 'B', 'C', 'D', 'E', 'F'].map((ot_name, index) => ({
  ot_name, abbreviation: ot_name, color: ['金', '紫', '蓝'][index % 3],
}))
const loadout = (status, discNames = ['A', 'B', 'C'], targetDiscNames = ['D', 'E', 'F']) => ({ status, discNames, targetDiscNames })
function render(discLoadouts) {
  const entry = { name: '测试密探', discLoadouts }
  const wrapper = mount(OperatorDiscTargetModal, { props: { entry, catalog }, global: { stubs: { teleport: true } } })
  return { wrapper, cards: wrapper.findAll('.disc-target-detail'), entry }
}

it.each([
  ['perfect', 'perfect', 0],
  ['perfect', 'reroll', 1],
  ['unmarked', 'reroll', 2],
  ['reroll', 'reroll', 2],
])('%s / %s 独立显示用户状态，目标区数量为 %i', (first, second, targets) => {
  const discLoadouts = [loadout(first), loadout(second)]
  const before = JSON.stringify(discLoadouts)
  const { wrapper, cards, entry } = render(discLoadouts)
  expect(wrapper.get('h3').text()).toBe('测试密探 · 命盘目标')
  expect(cards).toHaveLength(2)
  expect(cards.map(card => card.get('h4').text())).toEqual(['命盘一', '命盘二'])
  expect(wrapper.findAll('h5').filter(heading => heading.text() === '目标命盘')).toHaveLength(targets)
  for (const [index, status] of [first, second].entries()) {
    expect(cards[index].get('.disc-target-status').classes()).toContain('is-' + status)
    expect(cards[index].findAll('.disc-comparison-term').slice(0, 3).map(term => term.text())).toEqual(['A', 'B', 'C'])
    expect(cards[index].findAll('.is-changed')).toHaveLength(status === 'perfect' ? 0 : 3)
  }
  expect(wrapper.text()).not.toContain('→')
  expect(wrapper.findAll('.disc-comparison-term > small')).toHaveLength(0)
  expect(JSON.stringify(entry.discLoadouts)).toBe(before)
})

it.each([
  [['A', 'B', 'C'], ['A', 'D'], '已设置 2/3，1 条目标未匹配', ['D'], '待洗'],
  [['A', 'B', 'C'], ['B', 'A'], '已设置 2/3，已填写目标均已匹配', [], '待洗'],
  [['A', 'B', 'C'], ['C', 'A', 'B'], '当前已符合目标，标记由你确认', [], '待洗'],
  [[], ['A', 'B', 'C'], '3 条目标未匹配', ['A', 'B', 'C'], '待洗 · 3处'],
  [['A'], [], '目标未设置', [], '待洗'],
  [[], [], '未配置命盘', [], '待洗'],
])('待洗盘按无序目标显示差异：%j / %j', (current, target, message, missing, badge) => {
  const { cards } = render([loadout('reroll', current, target)])
  const card = cards[0]
  expect(card.text()).toContain(message)
  expect(card.get('.disc-target-status').text()).toBe(badge)
  expect(card.findAll('.is-changed').map(term => term.text())).toEqual(missing)
  for (const term of card.findAll('.is-changed')) {
    expect(term.classes()).toContain('is-' + { A: 'gold', B: 'purple', C: 'blue', D: 'gold' }[term.text()])
  }
})

it('未标记无目标只显示实际或空状态，编辑和关闭保留原有事件', async () => {
  const { wrapper, cards } = render([loadout('unmarked', ['A'], []), loadout('unmarked', [], [])])
  expect(cards[0].findAll('.disc-comparison-term').map(term => term.text())).toEqual(['A'])
  expect(cards[1].text()).toContain('未配置命盘')
  expect(wrapper.findAll('h5')).toHaveLength(0)
  for (const card of cards) await card.get('button').trigger('click')
  expect(wrapper.emitted('edit')).toEqual([[0], [1]])
  await wrapper.get('[aria-label="关闭命盘目标"]').trigger('click')
  await wrapper.get('.disc-target-mask').trigger('click')
  expect(wrapper.emitted('close')).toHaveLength(2)
})

it('编辑表单默认对照展示与复制、移除操作不受紧凑模式影响', async () => {
  const wrapper = mount(OperatorDiscComparison, { props: { current: ['A'], target: ['D'], catalog, editable: true } })
  expect(wrapper.findAll('.disc-comparison-side')).toHaveLength(2)
  expect(wrapper.get('.disc-comparison-heading').text()).toContain('1 / 3')
  expect(wrapper.get('.disc-comparison-term.is-changed small').text()).toBe('目标')
  await wrapper.get('.disc-copy-current').trigger('click')
  await wrapper.get('[aria-label="移除目标词条D"]').trigger('click')
  expect(wrapper.emitted('copy')).toHaveLength(1)
  expect(wrapper.emitted('remove')).toEqual([['D']])
})
