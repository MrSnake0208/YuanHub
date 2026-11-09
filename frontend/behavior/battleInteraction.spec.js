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
  expect(draft.rounds[0].actions).toEqual([{ slot: 0, type: 'attack', target: 2 }, { type: 'interaction' }])
  expect(group('动作目标').findAll('button').every(item => item.attributes('disabled') === undefined)).toBe(true)
  await wrapper.findAll('.battle-actor-option')[0].trigger('click')
  await group('记录动作').findAll('button')[1].trigger('click')
  expect(draft.rounds[0].actions).toEqual([{ slot: 0, type: 'attack', target: 2 }, { type: 'interaction' }, { slot: 0, type: 'ultimate', target: 2 }])
  expect(wrapper.findAll('thead th')).toHaveLength(7)
  // 只打一个目标时与出图一致，不逐格重复目标名。
  expect(wrapper.get('[aria-label="编辑第1回合1号位动作"]').findAll('.battle-action-mark').map(mark => mark.text())).toEqual(['1A', '2箱', '3↑'])
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

it('编辑区展开在当前回合行下方；多目标时只标注主目标以外的目标', async () => {
  const { draft, wrapper, group } = setup()
  draft.rounds.push({ actions: [], remark: '' })
  draft.rounds[0].actions.push({ slot: 0, type: 'attack', target: 2 }, { slot: 0, type: 'attack', target: 2 }, { slot: 0, type: 'ultimate', target: 1 })
  await wrapper.get('[aria-label="编辑第1回合1号位动作"]').trigger('click')
  const bodyRows = wrapper.findAll('tbody > tr')
  expect(bodyRows[1].find('#battle-action-detail').exists()).toBe(true)
  expect(bodyRows[1].get('h3').text()).toBe('第 1 回合')
  expect(wrapper.get('[aria-label="编辑第1回合1号位动作"]').findAll('.battle-action-mark').map(mark => mark.text())).toEqual(['1A', '2A', '3↑打左一'])
  await wrapper.findAll('button').find(item => item.text().includes('下一回合')).trigger('click')
  expect(wrapper.findAll('tbody > tr')[2].find('#battle-action-detail').exists()).toBe(true)
  expect(group('动作目标').findAll('button')).toHaveLength(5)
})

it('敌方名称在图例旁改名，表格与选择同步更新', async () => {
  const { draft, wrapper, button } = setup()
  await button('改名').trigger('click')
  await wrapper.get('[aria-label="敌方2名称（左一）"]').setValue('小怪')
  expect(draft.targets[1]).toBe('小怪')
  expect(wrapper.get('.battle-action-legend').text()).toContain('小怪')
  await button('完成改名').trigger('click')
  expect(wrapper.find('#battle-target-fields').exists()).toBe(false)
})

it('手机回合栏：翻回合与新增回合不重建按钮、焦点留在栏内；展开与收起通知页面切换底栏', async () => {
  const { draft, wrapper } = setup()
  document.body.appendChild(wrapper.element)
  expect(wrapper.find('.battle-round-dock').exists()).toBe(false)
  await wrapper.get('[aria-label="编辑第1回合1号位动作"]').trigger('click')
  expect(wrapper.emitted('recording')).toEqual([[true]])
  const dock = wrapper.get('.battle-round-dock')
  const [prev, , next] = dock.findAll('button')
  expect(prev.attributes('disabled')).toBeDefined()
  expect(next.attributes('aria-label')).toBe('新增回合')
  next.element.focus()
  await next.trigger('click')
  await wrapper.vm.$nextTick()
  expect(draft.rounds).toHaveLength(2)
  expect(dock.get('.battle-round-dock-title b').text()).toBe('第 2 回合')
  expect(wrapper.get('h3').text()).toBe('第 2 回合')
  expect(document.activeElement).toBe(next.element)
  next.element.focus()
  await prev.trigger('click')
  await wrapper.vm.$nextTick()
  expect(wrapper.get('h3').text()).toBe('第 1 回合')
  expect(next.attributes('aria-label')).toBe('下一回合')
  await dock.get('[aria-label="收起回合编辑"]').trigger('click')
  expect(wrapper.find('.battle-round-dock').exists()).toBe(false)
  expect(wrapper.emitted('recording').at(-1)).toEqual([false])
  wrapper.unmount()
})

it('有备注的回合在行下显示备注带，点按打开该回合编辑；无备注不占行', async () => {
  const { draft, wrapper } = setup()
  draft.rounds.push({ actions: [], remark: '' })
  draft.rounds[1].remark = '控血到一半'
  await wrapper.vm.$nextTick()
  expect(wrapper.findAll('tr.battle-remark-row')).toHaveLength(1)
  await wrapper.get('[aria-label="第2回合备注：控血到一半，点按编辑"]').trigger('click')
  expect(wrapper.get('h3').text()).toBe('第 2 回合')
  expect(wrapper.get('textarea[aria-label="本回合备注"]').element.value).toBe('控血到一半')
})
