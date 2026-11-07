import { expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import BattleRecorder from '../src/components/work/BattleRecorder.vue'
import BattleImageSheet from '../src/components/work/BattleImageSheet.vue'
import { buildBattleImageModel, createBattleDraft } from '../src/utils/battleImages.js'

const setup = () => {
  const draft = reactive(createBattleDraft())
  draft.operators[0].name = '杨修'
  const wrapper = mount(BattleRecorder, { props: { operators: draft.operators, rounds: draft.rounds, targets: draft.targets } })
  const button = text => wrapper.findAll('button').find(item => item.text() === text)
  const group = label => wrapper.get(`[role="group"][aria-label="${label}"]`)
  return { draft, wrapper, button, group }
}

it('箱插入全队出手顺序，不需要目标；表格不加列，挂在上一位出手密探格内', async () => {
  const { draft, wrapper, group } = setup()
  await wrapper.get('[aria-label="编辑第1回合1号位动作"]').trigger('click')
  await group('记录动作').findAll('button')[0].trigger('click')
  await wrapper.get('[aria-label="关卡互动（箱）"]').trigger('click')
  expect(group('动作目标').findAll('button').every(item => item.attributes('disabled') !== undefined)).toBe(true)
  const record = group('记录动作').findAll('button')
  expect(record.map(item => item.text())).toEqual(['箱关卡互动'])
  await record[0].trigger('click')
  await wrapper.findAll('.battle-actor-option')[0].trigger('click')
  await group('记录动作').findAll('button')[1].trigger('click')
  expect(draft.rounds[0].actions).toEqual([{ slot: 0, type: 'attack', target: 2 }, { type: 'interaction' }, { slot: 0, type: 'ultimate', target: 2 }])
  expect(wrapper.findAll('thead th')).toHaveLength(7)
  expect(wrapper.get('[aria-label="编辑第1回合1号位动作"]').findAll('.battle-action-mark').map(mark => mark.text())).toEqual(['1ABOSS', '2箱', '3↑BOSS'])
  expect(wrapper.get('[aria-label="第2步：关卡互动（箱），点按修改"]').text()).toContain('关卡互动')
})

it('修改步骤时箱与密探动作可原位互改，序号不变；箱步骤不能改动作类型', async () => {
  const { draft, wrapper, group } = setup()
  draft.rounds[0].actions.push({ slot: 0, type: 'attack', target: 1 }, { type: 'interaction' })
  await wrapper.get('[aria-label="编辑第1回合1号位动作"]').trigger('click')
  await wrapper.get('[aria-label="第2步：关卡互动（箱），点按修改"]').trigger('click')
  expect(wrapper.get('[aria-label="关卡互动（箱）"]').attributes('aria-pressed')).toBe('true')
  await group('修改第2步动作').findAll('button')[0].trigger('click')
  expect(draft.rounds[0].actions[1]).toEqual({ type: 'interaction' })
  await wrapper.findAll('.battle-actor-option')[0].trigger('click')
  expect(draft.rounds[0].actions).toEqual([{ slot: 0, type: 'attack', target: 1 }, { slot: 0, type: 'attack', target: 2 }])
  await wrapper.get('[aria-label="关卡互动（箱）"]').trigger('click')
  expect(draft.rounds[0].actions).toEqual([{ slot: 0, type: 'attack', target: 1 }, { type: 'interaction' }])
})

it('操作图不加箱列：箱以中性底挂在密探格内，用到时图例补一项', () => {
  const draft = createBattleDraft()
  draft.operators[0].name = '杨修'
  draft.rounds = [{ remark: '', actions: [{ slot: 0, type: 'attack', target: 2 }, { type: 'interaction' }, { slot: 0, type: 'attack', target: 0 }] }, { remark: '', actions: [{ slot: 0, type: 'attack', target: 2 }] }]
  const model = buildBattleImageModel(draft)
  const sheet = rows => mount(BattleImageSheet, { props: { model, kind: 'actions', rows } })
  const used = sheet(model.rows)
  expect(used.findAll('.team-card-head')).toHaveLength(5)
  const chips = used.findAll('.action-cell')[0].findAll('.action-chip')
  expect(chips.map(chip => chip.text())).toEqual(['1A', '2箱', '3A'])
  expect(chips[1].classes()).toContain('is-plain')
  expect(chips[1].attributes('style')).toBeUndefined()
  // 多目标只给例外上色：目标 2 打得最多为主目标，用中性底；目标 0 才带目标色。图例里主目标色块同为中性底。
  expect(chips[0].classes()).toContain('is-plain')
  expect(chips[0].attributes('style')).toBeUndefined()
  expect(chips[2].classes()).not.toContain('is-plain')
  expect(chips[2].attributes('style')).toContain('background')
  expect(used.findAll('.sheet-action-key em').map(swatch => swatch.classes().includes('is-plain'))).toEqual([false, true])
  expect(used.get('.sheet-action-key').text()).toContain('箱关卡互动')
  expect(sheet(model.rows.slice(1)).get('.sheet-action-key').text()).not.toContain('关卡互动')
})

it('属性图标只出现在配队图，操作图完整款与简化款都不显示', () => {
  const draft = createBattleDraft()
  draft.operators[0].name = '杨修'
  draft.rounds = [{ remark: '', actions: [{ slot: 0, type: 'attack', target: 2 }] }]
  const model = buildBattleImageModel(draft)
  model.operators[0].prof = '火'
  const icons = props => mount(BattleImageSheet, { props: { model, ...props } }).findAll('.team-card-prof').length
  expect(icons({ kind: 'team' })).toBe(1)
  expect(icons({ kind: 'actions', rows: model.rows })).toBe(0)
  expect(icons({ kind: 'actions', rows: model.rows, variant: 'simple' })).toBe(0)
})
