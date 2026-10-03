import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

const skin = vi.hoisted(() => ({ version: 'v3' }))
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
vi.mock('../src/config/operatorLedgerCard.js', async importOriginal => {
  const actual = await importOriginal()
  return { ...actual,
    get ACTIVE_OPERATOR_LEDGER_CARD_VERSION() { return skin.version },
    operatorLedgerCardVersionClass: () => actual.operatorLedgerCardVersionClass(skin.version),
  }
})

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
  vi.resetModules()
  vi.clearAllMocks()
  skin.version = 'v3'
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

async function render() {
  const { default: OperatorPage } = await import('../src/pages/operator/index.vue')
  const wrapper = mount(OperatorPage, { global: {
    stubs: { IslandSidebar: true, SiteFooter: true, AccountWorkspace: true, DataAccountContextBar: true,
      OperatorShareManager: true, OperatorGrowthTracker: true, StarLoadoutEditor: true, StarLoadoutModal: true,
      RouterLink: true },
    directives: { reveal: () => {} },
  } })
  await flushPromises()
  return wrapper
}
const currentTab = wrapper => wrapper.findAll('[role="tab"]').find(tab => tab.text() === '养成总览').trigger('click')
const slot = (wrapper, name = '测试密探') => wrapper.findAll('.slot').find(card => card.get('.slot-name').text() === name)
const ledger = (wrapper, name = '测试密探') => wrapper.findAll('.agent-ledger-card').find(card => card.text().includes(name))
function expectStatus(wrapper, status, name = '测试密探') {
  const id = name === '测试密探' ? 'op' : name
  // Badges are hidden for this release; retain saved-state and account-isolation coverage.
  expect(wrapper.vm.oddityCompletions[id]).toMatchObject({ compactLabel: '蝶' + status, label: '漆园蝶' + status })
  expect(wrapper.findAll('.oddity-completion-badge')).toHaveLength(0)
}
const expectNoStatus = wrapper => {
  expect(wrapper.vm.oddityCompletions).toEqual({})
  expect(wrapper.findAll('.oddity-completion-badge')).toHaveLength(0)
}
const expectNoWrites = () => {
  expect(api.patchOperatorCurrent).not.toHaveBeenCalled()
  expect(api.importOperator).not.toHaveBeenCalled()
  expect(starApi.putCurrentStarLoadout).not.toHaveBeenCalled()
}

it.each(['v1', 'v2', 'v3'])('%s 隐藏完成标签但保留三态计算，稀有度、等级/修为/标注与观测过期互不混淆', async version => {
  skin.version = version
  api.getOperatorCatalog.mockResolvedValue({ operators: [operator(), operator('未满', 4, [350, 1820, 11]), operator('缺项', 5, [500, 2600, 15]), operator('未拥有')] })
  const partial = entry([500, 2600, 15])
  delete partial.combat_stats.oddities.special
  api.getOperatorCurrent.mockResolvedValue(response({
    op: entry(), '未满': entry([350, 1820, 10], { level: 100, elite: 17 }),
    '缺项': partial, '未拥有': entry(undefined, { star_level: 0 }),
  }))
  api.getOperatorAnnotations.mockResolvedValue({ items: [{ operator_id: '未满', status: 'graduated', revision: 1 }] })
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  const wrapper = await render()
  await currentTab(wrapper); await flushPromises()
  expectStatus(wrapper, '已满')
  expectStatus(wrapper, '未满', '未满')
  expectStatus(wrapper, '待确认', '缺项')
  expect(ledger(wrapper).classes()).toContain(`agent-ledger-card--${version}`)
  expect(wrapper.vm.oddityCompletions['缺项'].reason).toBe('第三项尚未记录')
  expect(wrapper.vm.oddityCompletions['未拥有']).toBeUndefined()
  expect(wrapper.findAll('.oddity-completion-reason')).toHaveLength(0)
  expect(slot(wrapper, '未拥有').find('.oddity-completion-badge').exists()).toBe(false)
  expectNoWrites()
  expect(storage.mock.calls.some(([key, value]) => /combat-stats|oddity/.test(key) || /oddityRecordedValues|oddityCompletionSchema/.test(value))).toBe(false)
})

it.each(['combat_stats', 'combatStats', 'stats', 'root'])('%s 原始缺项不因归一化或旧缓存补零而成为未满', async field => {
  const raw = entry()
  delete raw.combat_stats
  const stats = { oddities: { attack: { current: 0 }, hp: { current: 0 } } }
  if (field === 'root') Object.assign(raw, stats)
  else raw[field] = stats
  api.getOperatorCurrent.mockResolvedValue(response({ op: raw }))
  localStorage.setItem('yuanhub:operator-combat-stats:v1:accA:如鸢:op', JSON.stringify({ oddities: values([300, 1560, 9]) }))
  const wrapper = await render()
  await currentTab(wrapper); await flushPromises()
  expectStatus(wrapper, '待确认')
  expectNoWrites()
})

it.each([
  [[0, 0, 0], [300, 1560, 9], '未满'],
  [[0, 0, 0], [0, 0, 0], '已满'],
  [[300, 1560, null], [300, 1560, 9], '待确认'],
  [[300, 1560, -1], [300, 1560, 9], '待确认'],
  [[300, 1560, 10], [300, 1560, 9], '待确认'],
  [[300, 1560, 9], [300, 1560, null], '待确认'],
  [[300, 1560, 1], [300, 1560, true], '待确认'],
])('完整性与原始公共 schema 边界 %#', async (numbers, limits, status) => {
  api.getOperatorCatalog.mockResolvedValue({ operators: [operator('op', 3, limits)] })
  api.getOperatorCurrent.mockResolvedValue(response({ op: entry(numbers) }))
  const wrapper = await render()
  await currentTab(wrapper); await flushPromises()
  expectStatus(wrapper, status)
  expectNoWrites()
})

it('目录事件刷新公共上限并重算，缺名称不阻断，旧 max 与迟到目录响应无效', async () => {
  const raw = entry()
  raw.combat_stats.oddities.special.max = 999
  api.getOperatorCurrent.mockResolvedValue(response({ op: raw }))
  const wrapper = await render()
  await currentTab(wrapper); await flushPromises()
  expectStatus(wrapper, '已满')
  await wrapper.findAll('[role="tab"]').find(tab => tab.text() === '密探图鉴').trigger('click')
  const oldCatalog = deferred()
  api.getOperatorCatalog.mockReturnValueOnce(oldCatalog.promise)
  events.handler({ event: 'operator_catalog_update', data: {} })
  await nextTick()
  expectNoStatus(wrapper)
  api.getOperatorCatalog.mockResolvedValueOnce({ operators: [operator('op', 3, [300, 1560, 10])] })
  events.handler({ event: 'operator_catalog_updated', data: {} })
  await flushPromises()
  expectStatus(wrapper, '未满')
  oldCatalog.resolve({ operators: [operator()] }); await flushPromises()
  expectStatus(wrapper, '未满')
  api.getOperatorCatalog.mockResolvedValueOnce({ operators: [operator('op', 3, [300, 1560, null])] })
  events.handler({ event: 'operator_catalog_updated', data: {} }); await flushPromises()
  expectStatus(wrapper, '待确认')
  expectNoWrites()
})

it.each(['未登录', '无账号', '账号加载失败', '养成加载失败'])('%s 不展示完成标签', async state => {
  if (state === '未登录') auth.isLoggedIn = false
  if (state === '无账号') {
    activeAccount.id = ''
    api.listOperatorAccounts.mockResolvedValue([])
  }
  if (state === '账号加载失败') api.listOperatorAccounts.mockRejectedValue(new Error('账号失败'))
  if (state === '养成加载失败') api.getOperatorCurrent.mockRejectedValue(new Error('养成失败'))
  const wrapper = await render()
  await currentTab(wrapper); await flushPromises()
  expectNoStatus(wrapper)
  expectNoWrites()
})

it('卡片草稿/取消/失败保持保存状态，成功按服务端响应刷新双处且不提交元数据', async () => {
  api.getOperatorCurrent.mockResolvedValue(response({ op: entry([299, 1560, 9]) }))
  const wrapper = await render()
  await currentTab(wrapper); await flushPromises()
  const input = () => ledger(wrapper).get('[aria-label="测试密探奇闻属性攻击力"]')
  await input().setValue('300')
  expectStatus(wrapper, '未满')
  expectNoWrites()
  await ledger(wrapper).get('.ledger-card-cancel').trigger('click')
  expect(input().element.value).toBe('299')
  expectStatus(wrapper, '未满')
  await input().setValue('300')
  api.patchOperatorCurrent.mockRejectedValueOnce(new Error('保存失败'))
  await ledger(wrapper).get('.ledger-card-save').trigger('click'); await flushPromises()
  expectStatus(wrapper, '未满')
  const pending = deferred()
  api.patchOperatorCurrent.mockReturnValueOnce(pending.promise)
  await ledger(wrapper).get('.ledger-submit-actions .ledger-card-save').trigger('click')
  expectStatus(wrapper, '未满')
  pending.resolve({ entry: entry([300, 1560, 9], { revision: 2 }) })
  await flushPromises()
  expectStatus(wrapper, '已满')
  expect(JSON.stringify(api.patchOperatorCurrent.mock.calls)).not.toMatch(/oddityRecordedValues|oddityCompletionSchema/)
})

it('完整编辑的第三项拉满、取消与失败不变，保存响应才把缺项改为已满', async () => {
  const partial = entry()
  delete partial.combat_stats.oddities.special
  api.getOperatorCurrent.mockResolvedValue(response({ op: partial }))
  const wrapper = await render()
  await currentTab(wrapper); await flushPromises()
  const edit = () => wrapper.get('[aria-label="编辑测试密探"]').trigger('click')
  await edit(); await flushPromises()
  await wrapper.get('.oddity-fill-max').trigger('click')
  expectStatus(wrapper, '待确认')
  expectNoWrites()
  await wrapper.get('.editor-close').trigger('click'); await flushPromises()
  expectStatus(wrapper, '待确认')
  await edit(); await flushPromises()
  await wrapper.get('.oddity-fill-max').trigger('click')
  api.patchOperatorCurrent.mockRejectedValueOnce(new Error('保存失败'))
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expectStatus(wrapper, '待确认')
  api.patchOperatorCurrent.mockResolvedValueOnce({ entry: entry() })
  await wrapper.get('.editor-save').trigger('click'); await flushPromises()
  expectStatus(wrapper, '已满')
})

it('账号A→B立即隐藏旧状态，失败继续隐藏，重试B后清空或退出不残留', async () => {
  const wrapper = await render()
  await currentTab(wrapper); await flushPromises()
  expectStatus(wrapper, '已满')
  const pending = deferred()
  api.getOperatorCurrent.mockReturnValueOnce(pending.promise)
  activeAccount.set('accB'); await nextTick()
  expectNoStatus(wrapper)
  await currentTab(wrapper)
  expectNoStatus(wrapper)
  pending.reject(new Error('B失败')); await flushPromises()
  expectNoStatus(wrapper)
  api.getOperatorCurrent.mockResolvedValue(response({ op: entry([1, 2, 3]) }))
  await currentTab(wrapper); await flushPromises()
  expectStatus(wrapper, '未满')
  expect(api.getOperatorCurrent).toHaveBeenLastCalledWith({ accountId: 'accB', game: '如鸢' })
  activeAccount.set(''); await nextTick()
  expectNoStatus(wrapper)
  activeAccount.set('accB'); await nextTick()
  expectNoStatus(wrapper)
  await currentTab(wrapper); await flushPromises()
  auth.isLoggedIn = false; await nextTick()
  expectNoStatus(wrapper)
  expectNoWrites()
})

it('延迟A读取不覆盖B；版本切换成功加载前隐藏旧状态', async () => {
  const pendingA = deferred()
  api.getOperatorCurrent.mockReturnValueOnce(pendingA.promise)
  const wrapper = await render()
  expectNoStatus(wrapper)
  activeAccount.set('accB')
  api.getOperatorCurrent.mockResolvedValue(response({ op: entry([0, 0, 0]) }))
  await currentTab(wrapper); await flushPromises()
  expectStatus(wrapper, '未满')
  pendingA.resolve(response({ op: entry() })); await flushPromises()
  expectStatus(wrapper, '未满')
  const pendingGame = deferred()
  api.getOperatorCurrent.mockReturnValueOnce(pendingGame.promise)
  activeAccount.setGame('代号鸢'); await nextTick()
  expectNoStatus(wrapper)
  await currentTab(wrapper)
  expectNoStatus(wrapper)
  pendingGame.resolve(response({ op: entry() })); await flushPromises()
  expectStatus(wrapper, '已满')
  expect(api.getOperatorCurrent).toHaveBeenLastCalledWith({ accountId: 'accB', game: '代号鸢' })
  expectNoWrites()
})

it('A完整编辑保存后切到B，迟到A响应不改变B标签或持久化B数据', async () => {
  api.getOperatorCurrent.mockResolvedValue(response({ op: entry([1, 2, 3]) }))
  const wrapper = await render()
  await currentTab(wrapper); await flushPromises()
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click'); await flushPromises()
  await wrapper.get('.oddity-fill-max').trigger('click')
  const pending = deferred()
  api.patchOperatorCurrent.mockReturnValueOnce(pending.promise)
  await wrapper.get('.editor-save').trigger('click')
  activeAccount.set('accB')
  await currentTab(wrapper); await flushPromises()
  expectStatus(wrapper, '未满')
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  pending.resolve({ entry: entry() }); await flushPromises()
  expectStatus(wrapper, '未满')
  expect(storage).not.toHaveBeenCalled()
  expect(api.patchOperatorCurrent).toHaveBeenCalledTimes(1)
  expect(starApi.putCurrentStarLoadout).not.toHaveBeenCalled()
})

it('保存响应仍缺第三项时保持待确认，不能采用草稿中的补零', async () => {
  api.getOperatorCurrent.mockResolvedValue(response({ op: entry([299, 1560, 9]) }))
  const wrapper = await render()
  await currentTab(wrapper); await flushPromises()
  await ledger(wrapper).get('[aria-label="测试密探奇闻属性攻击力"]').setValue('300')
  const partial = entry()
  delete partial.combat_stats.oddities.special
  api.patchOperatorCurrent.mockResolvedValueOnce({ entry: partial })
  await ledger(wrapper).get('.ledger-card-save').trigger('click'); await flushPromises()
  expectStatus(wrapper, '待确认')
})

it('A卡片保存后切到B再回A，旧保存响应也不能覆盖重新加载的A', async () => {
  api.getOperatorCurrent.mockResolvedValue(response({ op: entry([299, 1560, 9]) }))
  const wrapper = await render()
  await currentTab(wrapper); await flushPromises()
  await ledger(wrapper).get('[aria-label="测试密探奇闻属性攻击力"]').setValue('300')
  const pending = deferred()
  api.patchOperatorCurrent.mockReturnValueOnce(pending.promise)
  await ledger(wrapper).get('.ledger-card-save').trigger('click')
  activeAccount.set('accB'); await currentTab(wrapper); await flushPromises()
  activeAccount.set('accA'); await currentTab(wrapper); await flushPromises()
  expectStatus(wrapper, '未满')
  const storage = vi.spyOn(Storage.prototype, 'setItem')
  pending.resolve({ entry: entry() }); await flushPromises()
  expectStatus(wrapper, '未满')
  expect(storage).not.toHaveBeenCalled()
})

it('A的旧后端兼容错误迟到后，不在B重放保存请求', async () => {
  const wrapper = await render()
  await wrapper.get('[aria-label="编辑测试密探"]').trigger('click'); await flushPromises()
  const pending = deferred()
  api.patchOperatorCurrent.mockReturnValueOnce(pending.promise)
  await wrapper.get('.editor-save').trigger('click')
  activeAccount.set('accB'); await currentTab(wrapper); await flushPromises()
  pending.reject(Object.assign(new Error('unsupported field display_mode'), { code: 'unsupported_field' }))
  await flushPromises()
  expect(api.patchOperatorCurrent).toHaveBeenCalledTimes(1)
  expectStatus(wrapper, '已满')
})

it('卸载后迟到读取不再推进初始化、订阅或额外请求', async () => {
  const pending = deferred()
  api.getOperatorCurrent.mockReturnValueOnce(pending.promise)
  const wrapper = await render()
  wrapper.unmount()
  const calls = api.getOperatorCurrent.mock.calls.length
  pending.resolve(response({ op: entry() })); await flushPromises()
  expect(api.getOperatorCurrent).toHaveBeenCalledTimes(calls)
  expect(api.listOperatorScanReviews).not.toHaveBeenCalled()
  expectNoWrites()
})
