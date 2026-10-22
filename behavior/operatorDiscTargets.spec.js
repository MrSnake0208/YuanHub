import { createPinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import discPresets from '../src/data/operatorDiscPresets.json'

const events = vi.hoisted(() => ({ handler: null }))
vi.mock('vue-router', () => ({
  useRouter: () => ({ replace: vi.fn().mockResolvedValue(), push: vi.fn() }),
  useRoute: () => ({ query: {}, path: '/operator' }),
  onBeforeRouteLeave: () => {}, onBeforeRouteUpdate: () => {},
}))
vi.mock('../src/api/operator.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/inventory.js', async importOriginal => {
  const actual = await importOriginal()
  return Object.fromEntries(Object.keys(actual).map(key => [key, vi.fn()]))
})
vi.mock('../src/api/starState.js', () => ({ getCurrentStarState: vi.fn() }))
vi.mock('../src/api/starLoadout.js', () => ({ getCurrentStarLoadout: vi.fn(), putCurrentStarLoadout: vi.fn() }))
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: true }) }
})
vi.mock('../src/store/activeAccount.js', async () => {
  const { reactive } = await import('vue')
  return { activeAccount: reactive({
    id: 'accA', game: '如鸢', gameFor() { return this.game },
    set(value) { this.id = value }, setGame(value) { this.game = value }, syncAccounts: vi.fn(),
  }) }
})
vi.mock('../src/store/accountEvents.js', () => ({ subscribeAccountEvents: handler => {
  events.handler = handler
  return () => { events.handler = null }
} }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn().mockResolvedValue(true), alert: vi.fn() } }))

let api, activeAccount, auth, starApi, inventoryApi
const keys = ['attack', 'hp', 'special']
const schema = limits => Object.fromEntries(keys.map((key, index) => [key, { max: limits[index] }]))
const values = numbers => Object.fromEntries(keys.map((key, index) => [key, { current: numbers[index] }]))
const operator = (id = 'op', rarity = 3, limits = [300, 1560, 9]) => ({
  id, name: id === 'op' ? '测试密探' : id, rarity, prof: '阳', sub_prof: '输出',
  games: ['如鸢', '代号鸢'], oddity_schema: schema(limits),
})
const entry = (numbers = [300, 1560, 9], extra = {}) => ({
  level: 1, elite: 1, star_level: 1, revision: 1,
  combat_stats: { oddities: values(numbers), observed_status: 'stale' }, ...extra,
})
const response = entries => [{ entries }]
const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(async () => {
  // jsdom does not implement scrolling; layout remains manual acceptance.
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  vi.resetModules()
  vi.clearAllMocks()
  events.handler = null
  api = await import('../src/api/operator.js')
  inventoryApi = await import('../src/api/inventory.js')
  starApi = await import('../src/api/starLoadout.js')
  ;({ activeAccount } = await import('../src/store/activeAccount.js'))
  ;({ auth } = await import('../src/store/auth.js'))
  activeAccount.id = 'accA'
  activeAccount.game = '如鸢'
  auth.isLoggedIn = true
  api.getOperatorCatalog.mockResolvedValue({ operators: [operator()] })
  api.listOperatorAccounts.mockResolvedValue([
    { id: 'accA', name: '账号A', game: '如鸢' }, { id: 'accB', name: '账号B', game: '如鸢' },
  ])
  api.getOperatorCurrent.mockResolvedValue(response({ op: entry() }))
  api.getOperatorAnnotations.mockResolvedValue({ items: [] })
  api.listOperatorScanReviews.mockResolvedValue({ items: [] })
  inventoryApi.listAgentFavorites.mockResolvedValue({ agent_ids: [] })
  inventoryApi.getCurrent.mockResolvedValue([])
  const { getCurrentStarState } = await import('../src/api/starState.js')
  getCurrentStarState.mockResolvedValue({ generation: 0, entries: [] })
  starApi.getCurrentStarLoadout.mockResolvedValue({ generation: 0, revision: 0, loadouts: {} })
  const { starLoadoutPresetStore } = await import('../src/domain/starLoadoutPresets.js')
  vi.spyOn(starLoadoutPresetStore, 'load').mockResolvedValue()
  const media = new EventTarget()
  media.matches = false
  vi.stubGlobal('matchMedia', vi.fn(() => media))
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => { delete HTMLElement.prototype.scrollIntoView })

async function render() {
  const { default: OperatorPage } = await import('../src/pages/operator/index.vue')
  const wrapper = mount(OperatorPage, { attachTo: document.body, global: { plugins: [createPinia()],
    stubs: { OnboardingGuide: true, IslandSidebar: true, SiteFooter: true, AccountWorkspace: true, DataAccountContextBar: true,
      OperatorShareManager: true, OperatorGrowthTracker: true, StarLoadoutEditor: true, StarLoadoutModal: true,
      RouterLink: true },
    directives: { reveal: () => {} },
  } })
  await flushPromises()
  return wrapper
}
const discs = ['A', 'B', 'C', 'D', 'E'].map(ot_name => ({ ot_name, abbreviation: ot_name, color: '金' }))
const loadout = (id, names, status = 'unmarked', targets = []) => ({ id, name: id, discs: names.map(ot_name => ({ ot_name })), status, target_discs: targets.map(ot_name => ({ ot_name })) })
it('快捷命盘只填入选中组合和编辑对象，保留手动名称与标记，保存前不写接口', async () => {
  const id = 'char_001_yangxiu'
  const choices = discPresets[id]
  const names = [...new Set(choices.flat())]
  api.getOperatorCatalog.mockResolvedValue({ operators: [{ ...operator(id), discs: names.map(ot_name => ({ ot_name, color: '金' })) }] })
  api.getOperatorCurrent.mockResolvedValue(response({ [id]: entry(undefined, {
    disc_loadouts: [loadout('手动名称', [names[0]], 'perfect'), loadout('另一盘', [names[1]], 'reroll', [names[2]])],
  }) }))
  const wrapper = await render()
  await wrapper.findAll('[role="tab"]').find(tab => tab.text() === '养成总览').trigger('click')
  await flushPromises()
  await wrapper.get('[aria-label="编辑' + id + '"]').trigger('click'); await flushPromises()
  await wrapper.get('#operator-editor-tab-discs').trigger('click')
  await wrapper.findAll('.disc-preset')[0].trigger('click')
  expect(wrapper.vm.editForm.discLoadouts[0].discNames).toEqual(choices[0])
  expect(wrapper.vm.editForm.discLoadouts[0].name).toBe('手动名称')
  expect(wrapper.vm.editForm.discLoadouts[0].status).toBe('perfect')
  await wrapper.get('.disc-preset-feedback button').trigger('click')
  expect(wrapper.vm.editForm.discLoadouts[0].discNames).toEqual([names[0]])
  await wrapper.findAll('.disc-preset')[0].trigger('click')
  await wrapper.get('#disc-loadout-tab-1').trigger('click')
  expect(wrapper.find('.disc-preset-feedback button').exists()).toBe(false)
  await wrapper.get('.disc-auto-name').trigger('click')
  await wrapper.findAll('.disc-preset')[1].trigger('click')
  expect(wrapper.vm.editForm.discLoadouts[1].discNames).toEqual(choices[1])
  expect(wrapper.vm.editForm.discLoadouts[1].name).toBe(choices[1].join(' · '))
  await wrapper.findAll('.disc-pick-mode button').find(button => button.text() === '编辑目标命盘').trigger('click')
  expect(wrapper.find('.disc-preset-feedback button').exists()).toBe(false)
  await wrapper.findAll('.disc-preset')[2].trigger('click')
  expect(wrapper.vm.editForm.discLoadouts.map(l => l.discNames)).toEqual([choices[0], choices[1]])
  expect(wrapper.vm.editForm.discLoadouts.map(l => l.targetDiscNames)).toEqual([[], choices[2]])
  expect(wrapper.vm.editForm.discLoadouts[1].status).toBe('reroll')
  expect(api.patchOperatorCurrent).not.toHaveBeenCalled()
  api.patchOperatorCurrent.mockImplementation(async ({ patch }) => ({ entry: entry(undefined, { ...patch, revision: 2 }) }))
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expect(api.patchOperatorCurrent).toHaveBeenCalledTimes(1)
  const patch = api.patchOperatorCurrent.mock.calls[0][0].patch
  expect(patch.disc_loadouts.map(l => l.discs.map(d => d.ot_name))).toEqual([choices[0], choices[1]])
  expect(patch.disc_loadouts.map(l => l.target_discs.map(d => d.ot_name))).toEqual([[], choices[2]])
  wrapper.unmount()
})

async function showRoster(entries) {
  api.getOperatorCatalog.mockResolvedValue({ operators: [{ ...operator(), discs }, { ...operator('other'), discs }] })
  api.getOperatorCurrent.mockResolvedValue(response(entries))
  const wrapper = await render()
  await wrapper.findAll('[role="tab"]').find(tab => tab.text() === '养成总览').trigger('click')
  await flushPromises()
  return wrapper
}

it('双目标切换不丢草稿，修改目标不改实际命盘，保存重开保留两套并由卡片保存继续携带', async () => {
  let saved = entry([300, 1560, 9], { disc_loadouts: [loadout('one', ['A', 'B', 'C']), loadout('two', ['B', 'C', 'D'])] })
  const wrapper = await showRoster({ op: saved })
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click'); await flushPromises()
  await wrapper.get('#operator-editor-tab-discs').trigger('click')
  await wrapper.findAll('.disc-status-controls button').find(button => button.text() === '待洗').trigger('click')
  await wrapper.findAll('.disc-pick-mode button').find(button => button.text() === '编辑目标命盘').trigger('click')
  for (const name of ['A', 'B', 'D']) await wrapper.findAll('.disc-option').find(option => option.text() === name).get('input').setValue(true)
  await wrapper.get('#disc-loadout-tab-1').trigger('click')
  await wrapper.findAll('.disc-status-controls button').find(button => button.text() === '待洗').trigger('click')
  for (const name of ['A', 'C', 'E']) await wrapper.findAll('.disc-option').find(option => option.text() === name).get('input').setValue(true)
  await wrapper.get('#disc-loadout-tab-0').trigger('click')
  expect(wrapper.vm.editForm.discLoadouts[0].targetDiscNames).toEqual(['A', 'B', 'D'])
  expect(wrapper.vm.editForm.discLoadouts[1].targetDiscNames).toEqual(['A', 'C', 'E'])
  expect(wrapper.vm.editForm.discLoadouts.map(item => item.discNames)).toEqual([['A', 'B', 'C'], ['B', 'C', 'D']])
  api.patchOperatorCurrent.mockImplementation(async ({ patch }) => {
    saved = { ...saved, disc_loadouts: patch.disc_loadouts, revision: 2 }
    return { entry: saved }
  })
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expect(api.patchOperatorCurrent).toHaveBeenCalledTimes(1)
  const patch = api.patchOperatorCurrent.mock.calls[0][0].patch
  expect(patch.disc_loadouts.map(item => item.target_discs.map(disc => disc.ot_name))).toEqual([['A', 'B', 'D'], ['A', 'C', 'E']])
  await vi.advanceTimersByTimeAsync(800); await flushPromises()
  expect(wrapper.get('.ledger-disc-target-summary').text()).toBe('一盘待洗·1处二盘待洗·2处')
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click'); await flushPromises()
  expect(wrapper.vm.editForm.discLoadouts[1].targetDiscNames).toEqual(['A', 'C', 'E'])
  await wrapper.vm.closeEditor(); await flushPromises()
  const rosterEntry = wrapper.vm.currentEntries.find(item => item.id === 'op')
  const draft = wrapper.vm.ensureCardDraft(rosterEntry)
  draft.level = 2
  await wrapper.vm.saveCardDraft(rosterEntry); await flushPromises()
  expect(api.patchOperatorCurrent.mock.calls.at(-1)[0].patch.disc_loadouts).toEqual(patch.disc_loadouts)
  wrapper.unmount()
})

it('名册筛选任意待洗盘，详情精简完美盘并保留待洗目标，进入指定组合，切换账号关闭详情且不串目标', async () => {
  const wrapper = await showRoster({
    op: entry(undefined, { disc_loadouts: [loadout('one', ['A'], 'perfect'), loadout('two', ['B'], 'reroll', ['D'])] }),
    other: entry(undefined, { disc_loadouts: [loadout('one', ['A'])] }),
  })
  await wrapper.findAll('button').find(button => button.text() === '只看待洗').trigger('click')
  expect(wrapper.findAll('.agent-ledger-card')).toHaveLength(1)
  expect(wrapper.get('.ledger-disc-target-summary').text()).toBe('一盘完美二盘待洗')
  wrapper.get('.ledger-disc-target-summary').element.focus()
  await wrapper.get('.ledger-disc-target-summary').trigger('click'); await flushPromises()
  expect(document.body.style.overflow).toBe('hidden')
  const details = document.querySelectorAll('.disc-target-detail')
  expect(details[0].textContent).toContain('A')
  expect(details[0].textContent).not.toContain('目标命盘')
  expect(details[1].textContent).toContain('D')
  expect(details[1].textContent).toContain('已设置 1/3，1 条目标未匹配')
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises()
  expect(document.querySelector('.disc-target-modal')).toBeNull()
  expect(document.activeElement).toBe(wrapper.get('.ledger-disc-target-summary').element)
  expect(document.body.style.overflow).toBe('')
  await wrapper.get('.ledger-disc-target-summary').trigger('click'); await flushPromises()
  document.querySelectorAll('.disc-target-detail-heading button')[1].click(); await flushPromises()
  expect(wrapper.vm.editorSection).toBe('discs')
  expect(wrapper.vm.selectedDiscLoadoutIndex).toBe(1)
  expect(wrapper.vm.editingDiscTarget).toBe(true)
  await wrapper.vm.closeEditor(); await flushPromises()
  await wrapper.get('.ledger-disc-target-summary').trigger('click'); await flushPromises()
  api.getOperatorCurrent.mockResolvedValue(response({ op: entry(undefined, { disc_loadouts: [loadout('one', ['C'])] }) }))
  activeAccount.id = 'accB'; await flushPromises()
  expect(document.querySelector('.disc-target-modal')).toBeNull()
  expect(wrapper.find('.ledger-disc-target-summary').exists()).toBe(false)
  expect(wrapper.vm.onlyReroll).toBe(false)
  expect(api.patchOperatorCurrent).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('旧账号无目标正常显示；保存失败保留独立目标草稿', async () => {
  const wrapper = await showRoster({ op: entry() })
  expect(wrapper.find('.ledger-disc-target-summary').exists()).toBe(false)
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click'); await flushPromises()
  expect(wrapper.vm.editForm.discLoadouts.map(item => item.status)).toEqual(['unmarked', 'unmarked'])
  wrapper.vm.editForm.discLoadouts[1].status = 'reroll'
  wrapper.vm.editForm.discLoadouts[1].targetDiscNames = ['D']
  api.patchOperatorCurrent.mockRejectedValue(new Error('离线'))
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expect(wrapper.vm.editing).toBe(true)
  expect(wrapper.vm.editForm.discLoadouts[1].targetDiscNames).toEqual(['D'])
  expect(wrapper.vm.editForm.discLoadouts[0].targetDiscNames).toEqual([])
  wrapper.unmount()
})

it('账号A的迟到目标响应不能覆盖已经读取的账号B', async () => {
  const wrapper = await showRoster({ op: entry(undefined, { disc_loadouts: [loadout('one', ['A'], 'reroll', ['B'])] }) })
  const lateA = deferred()
  api.getOperatorCurrent.mockReturnValueOnce(lateA.promise)
  const reload = wrapper.vm.reloadCurrent(true)
  api.getOperatorCurrent.mockResolvedValue(response({ op: entry(undefined, { disc_loadouts: [loadout('one', ['C'], 'perfect')] }) }))
  activeAccount.id = 'accB'; await flushPromises()
  expect(wrapper.get('.ledger-disc-target-summary').text()).toBe('一盘完美')
  lateA.resolve(response({ op: entry(undefined, { disc_loadouts: [loadout('one', ['A'], 'reroll', ['D'])] }) }))
  await reload; await flushPromises()
  expect(wrapper.get('.ledger-disc-target-summary').text()).toBe('一盘完美')
  expect(wrapper.vm.currentEntries[0].discLoadouts[0].target_discs).toEqual([])
  expect(api.patchOperatorCurrent).not.toHaveBeenCalled()
  wrapper.unmount()
})
