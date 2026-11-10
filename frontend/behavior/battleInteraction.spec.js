import { expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { reactive } from 'vue'
import BattleRecorder from '../src/components/work/BattleRecorder.vue'
import BattleImageSheet from '../src/components/work/BattleImageSheet.vue'
import { buildBattleImageModel, createBattleDraft } from '../src/utils/battleImages.js'

const setup = () => {
  const draft = reactive(createBattleDraft())
  draft.operators[0].name = '杨修'
  // 桌面标题与动作链 Teleport 到表格上方，锚点必须在 document 中。
  const wrapper = mount(BattleRecorder, { attachTo: document.body, props: { operators: draft.operators, rounds: draft.rounds, targets: draft.targets, absentTargets: draft.absentTargets } })
  const button = text => wrapper.findAll('button').find(item => item.text() === text)
  const group = label => wrapper.get(`[role="group"][aria-label="${label}"]`)
  return { draft, wrapper, button, group }
}

it('场景交互插入全队出手顺序，不需要目标；表格不加列，挂在上一位出手密探格内', async () => {
  const { draft, wrapper, group } = setup()
  await wrapper.get('[aria-label="编辑第1回合1号位动作"]').trigger('click')
  await wrapper.get('.battle-action-input-row [aria-label="杨修 普攻"]').trigger('click')
  await wrapper.get('[aria-label="场景交互（互）"]').trigger('click')
  expect(draft.rounds[0].actions).toEqual([{ slot: 0, type: 'attack', target: 2 }, { type: 'interaction' }])
  expect(group('动作目标').findAll('button').every(item => item.attributes('disabled') === undefined)).toBe(true)
  await wrapper.get('.battle-action-input-row [aria-label="杨修 大招"]').trigger('click')
  expect(draft.rounds[0].actions).toEqual([{ slot: 0, type: 'attack', target: 2 }, { type: 'interaction' }, { slot: 0, type: 'ultimate', target: 2 }])
  expect(wrapper.findAll('thead th')).toHaveLength(7)
  // 只打一个目标时与出图一致，不逐格重复目标名。
  expect(wrapper.get('[aria-label="编辑第1回合1号位动作"]').findAll('.battle-action-mark').map(mark => mark.text())).toEqual(['1A', '2互', '3↑'])
  expect(wrapper.get('[aria-label="第2步：场景交互（互），点按修改"]').text()).toContain('场景交互')
})

it('修改场景交互步骤时，点矩阵直接改成密探动作，再点场景交互改回，序号不变', async () => {
  const { draft, wrapper } = setup()
  draft.rounds[0].actions.push({ slot: 0, type: 'attack', target: 1 }, { type: 'interaction' })
  await wrapper.get('[aria-label="编辑第1回合1号位动作"]').trigger('click')
  await wrapper.get('[aria-label="第2步：场景交互（互），点按修改"]').trigger('click')
  expect(wrapper.get('[aria-label="场景交互（互）"]').attributes('aria-pressed')).toBe('true')
  await wrapper.get('.battle-action-input-row [aria-label="杨修 普攻"]').trigger('click')
  expect(draft.rounds[0].actions[1]).toEqual({ slot: 0, type: 'attack', target: 2 })
  expect(draft.rounds[0].actions).toEqual([{ slot: 0, type: 'attack', target: 1 }, { slot: 0, type: 'attack', target: 2 }])
  await wrapper.get('[aria-label="场景交互（互）"]').trigger('click')
  expect(draft.rounds[0].actions).toEqual([{ slot: 0, type: 'attack', target: 1 }, { type: 'interaction' }])
})

it('操作图不加场景交互列：互以中性底挂在密探格内，用到时图例补一项', () => {
  const draft = createBattleDraft()
  draft.operators[0].name = '杨修'
  draft.rounds = [{ remark: '', actions: [{ slot: 0, type: 'attack', target: 2 }, { type: 'interaction' }, { slot: 0, type: 'attack', target: 0 }] }, { remark: '', actions: [{ slot: 0, type: 'attack', target: 2 }] }]
  const model = buildBattleImageModel(draft)
  const sheet = rows => mount(BattleImageSheet, { props: { model, kind: 'actions', rows } })
  const used = sheet(model.rows)
  expect(used.findAll('.team-card-head')).toHaveLength(5)
  const chips = used.findAll('.action-cell')[0].findAll('.action-chip')
  expect(chips.map(chip => chip.text())).toEqual(['1A', '2互', '3A'])
  expect(chips[1].classes()).toContain('is-plain')
  expect(chips[1].attributes('style')).toBeUndefined()
  // 主位固定中性底，目标 0 保留目标色；图例将主位排最左，色块与动作一致。
  expect(chips[0].classes()).toContain('is-plain')
  expect(chips[0].attributes('style')).toBeUndefined()
  expect(chips[2].classes()).not.toContain('is-plain')
  expect(chips[2].attributes('style')).toContain('background')
  const swatches = used.findAll('.sheet-action-key em')
  expect(swatches.map(swatch => swatch.element.parentElement.textContent)).toEqual(['BOSS', '左二'])
  expect(swatches.map(swatch => swatch.classes().includes('is-plain'))).toEqual([true, false])
  expect(used.get('.sheet-action-key').text()).toContain('互场景交互')
  expect(sheet(model.rows.slice(1)).get('.sheet-action-key').text()).not.toContain('场景交互')
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

it('桌面标题与目标在当前回合行上方，动作矩阵在下方；多目标时只标注非主目标', async () => {
  const { draft, wrapper, group } = setup()
  draft.rounds.push({ actions: [], remark: '' })
  draft.rounds[0].actions.push({ slot: 0, type: 'attack', target: 2 }, { slot: 0, type: 'attack', target: 2 }, { slot: 0, type: 'ultimate', target: 1 })
  await wrapper.get('[aria-label="编辑第1回合1号位动作"]').trigger('click')
  const activeRow = wrapper.get('[aria-label="编辑第1回合1号位动作"]').element.closest('tr')
  expect(activeRow.previousElementSibling.querySelector('[aria-label="动作目标"]')).not.toBeNull()
  expect(activeRow.previousElementSibling.previousElementSibling.querySelector('h3').textContent).toBe('第 1 回合')
  expect(activeRow.nextElementSibling.classList.contains('battle-action-input-row')).toBe(true)
  expect(wrapper.get('#battle-action-detail').element.closest('tr').previousElementSibling.classList.contains('battle-action-input-row')).toBe(true)
  expect(wrapper.get('[aria-label="编辑第1回合1号位动作"]').findAll('.battle-action-mark').map(mark => mark.text())).toEqual(['1A', '2A', '3↑打左一'])
  await wrapper.findAll('button').find(item => item.text().includes('下一回合')).trigger('click')
  const nextRow = wrapper.get('[aria-label="编辑第2回合1号位动作"]').element.closest('tr')
  expect(nextRow.previousElementSibling.previousElementSibling.querySelector('h3').textContent).toBe('第 2 回合')
  expect(nextRow.nextElementSibling.classList.contains('battle-action-input-row')).toBe(true)
  expect(group('动作目标').findAll('button')).toHaveLength(5)
})

it('敌方名称在图例旁改名，表格与选择同步更新', async () => {
  const { draft, wrapper, button } = setup()
  await button('敌方设置').trigger('click')
  await wrapper.get('[aria-label="敌方2名称（左一）"]').setValue('小怪')
  expect(draft.targets[1]).toBe('小怪')
  expect(wrapper.get('.battle-action-legend').text()).toContain('小怪')
  await button('完成设置').trigger('click')
  expect(wrapper.find('#battle-target-fields').exists()).toBe(false)
})

it('手机回合栏：翻回合与新增回合不重建按钮、焦点留在栏内；展开与收起通知页面切换底栏', async () => {
  vi.stubGlobal('matchMedia', vi.fn(query => ({ matches: query === '(max-width: 767px)', addEventListener: vi.fn(), removeEventListener: vi.fn() })))
  vi.stubGlobal('scrollTo', vi.fn())
  const { draft, wrapper } = setup()
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
