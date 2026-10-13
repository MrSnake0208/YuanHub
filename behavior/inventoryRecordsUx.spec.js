import { createPinia } from 'pinia'
import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import InventoryPage from '../src/pages/inventory/index.vue'
import * as inventoryApi from '../src/api/inventory.js'
import { getOperatorCatalog } from '../src/api/operator.js'
import { dialog } from '../src/utils/dialog.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { auth } from '../src/store/auth.js'
import { subscribeAccountEvents } from '../src/store/accountEvents.js'
import { installViewport } from '../test-support/viewport.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: true, userInfo: { id: 'synthetic-user' } }) }
})
vi.mock('vue-router', () => ({ onBeforeRouteLeave: () => {}, onBeforeRouteUpdate: () => {} }))
vi.mock('../src/api/inventory.js', () => ({
  getCatalog: vi.fn(), getCurrent: vi.fn(), getAcquired: vi.fn(), exportInventory: vi.fn(),
  importInventory: vi.fn(), listRecords: vi.fn(), deleteRecord: vi.fn(), restoreRecord: vi.fn(),
  listAccounts: vi.fn(), listAgentFavorites: vi.fn(), addAgentFavorite: vi.fn(), removeAgentFavorite: vi.fn(),
}))
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn() }))
vi.mock('../src/store/accountEvents.js', () => ({
  setInventoryToastFavoriteAgentIds: vi.fn(), subscribeAccountEvents: vi.fn(() => () => {}),
}))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

const record = {
  record_id: 'reward:1', record_type: 'reward_delta', entity_type: 'item',
  effective_at: '2026-09-27T10:00:00Z', stock_effect: 'applied',
  entries: [{ id: 'baijinbi', name: '白金币', count: 5 }],
}

const pending = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const history = wrapper => wrapper.get('#inventory-panel-records')
const filter = (wrapper, name) => history(wrapper).findAll('.records-filter button').find(button => button.text() === name)
const refresh = wrapper => history(wrapper).get('.records-head > button')
const undo = wrapper => history(wrapper).findAll('button').find(button => button.text() === '撤销删除')
let viewport

function render() {
  return mount(InventoryPage, { global: { plugins: [createPinia()],
    stubs: { OnboardingGuide: true,
      RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true,
      AccountWorkspace: true, DataAccountContextBar: true, ArchiveExchangePanel: true,
      ResourceBalanceReport: true, AcquiredPeriodReport: true, RewardEntryWorkspace: true,
    },
    directives: { reveal: () => {} },
  } })
}

beforeEach(() => {
  vi.resetAllMocks()
  viewport = installViewport()
  window.scrollTo = vi.fn()
  auth.isLoggedIn = true
  auth.userInfo = { id: 'synthetic-user' }
  localStorage.setItem('inventory-tabs', 'records')
  activeAccount.set('acc-1')
  inventoryApi.getCatalog.mockResolvedValue({ entities: [] })
  getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'char_001_test', name: '测试密探', rarity: 5, games: ['代号鸢'] }] })
  inventoryApi.getCurrent.mockResolvedValue([])
  activeAccount.setGame('代号鸢', 'acc-1')
  activeAccount.setGame('代号鸢', 'acc-2')
  inventoryApi.listAccounts.mockResolvedValue([
    { id: 'acc-1', name: '合成账号 A', game: '代号鸢' }, { id: 'acc-2', name: '合成账号 B', game: '代号鸢' },
  ])
  inventoryApi.listAgentFavorites.mockResolvedValue([])
  inventoryApi.listRecords.mockResolvedValue({ items: [record], next_cursor: 'next' })
  inventoryApi.deleteRecord.mockResolvedValue(true)
  inventoryApi.restoreRecord.mockResolvedValue(true)
  dialog.confirm.mockResolvedValue(true)
  subscribeAccountEvents.mockImplementation(() => () => {})
})

it('从清单进入历史才读取，加载中禁用动作且重复触发不重复请求', async () => {
  localStorage.setItem('inventory-tabs', 'manifest')
  inventoryApi.getCurrent.mockResolvedValue([{ account_id: 'acc-1', entity_type: 'item', full_baseline_at: record.effective_at, entries: {} }])
  const read = pending()
  inventoryApi.listRecords.mockReturnValueOnce(read.promise)
  const wrapper = render()
  await flushPromises()
  expect(inventoryApi.listRecords).not.toHaveBeenCalled()
  const tab = wrapper.get('#inventory-tab-records')
  await tab.trigger('click')
  expect(tab.attributes('aria-controls')).toBe('inventory-panel-records')
  expect(history(wrapper).attributes('aria-labelledby')).toBe('inventory-tab-records')
  expect(history(wrapper).isVisible()).toBe(true)
  expect(history(wrapper).text()).toContain('正在加载记录')
  expect(filter(wrapper, '全部').element.disabled).toBe(true)
  await refresh(wrapper).trigger('click')
  expect(inventoryApi.listRecords).toHaveBeenCalledTimes(1)
  expect(inventoryApi.listRecords).toHaveBeenLastCalledWith({ accountId: 'acc-1', entityType: undefined, cursor: null, limit: 50 })
  read.resolve({ items: [record], next_cursor: 'page-2' })
  await flushPromises()
  expect(history(wrapper).get('.record').text()).toContain('白金币+5')
  expect(filter(wrapper, '全部').attributes('aria-pressed')).toBe('true')
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
})

it('筛选全部/道具/心纸重置游标，同值不读取，分页追加且刷新替换', async () => {
  const wrapper = render()
  await flushPromises()
  await filter(wrapper, '全部').trigger('click')
  expect(inventoryApi.listRecords).toHaveBeenCalledTimes(1)
  for (const [name, entityType] of [['道具', 'item'], ['心纸', 'agent'], ['全部', undefined]]) {
    await filter(wrapper, name).trigger('click')
    await flushPromises()
    expect(inventoryApi.listRecords).toHaveBeenLastCalledWith({ accountId: 'acc-1', entityType, cursor: null, limit: 50 })
    expect(filter(wrapper, name).attributes('aria-pressed')).toBe('true')
  }
  const page = pending()
  inventoryApi.listRecords.mockReturnValueOnce(page.promise)
  const reads = inventoryApi.listRecords.mock.calls.length
  await history(wrapper).get('.load-more').trigger('click')
  await history(wrapper).get('.load-more').trigger('click')
  expect(inventoryApi.listRecords).toHaveBeenCalledTimes(reads + 1)
  expect(inventoryApi.listRecords).toHaveBeenLastCalledWith({ accountId: 'acc-1', entityType: undefined, cursor: 'next', limit: 50 })
  page.resolve({ items: [{ ...record, record_id: 'reward:2' }], next_cursor: null })
  await flushPromises()
  expect(history(wrapper).findAll('.record')).toHaveLength(2)
  expect(history(wrapper).find('.load-more').exists()).toBe(false)
  await refresh(wrapper).trigger('click')
  await flushPromises()
  expect(inventoryApi.listRecords).toHaveBeenLastCalledWith({ accountId: 'acc-1', entityType: undefined, cursor: null, limit: 50 })
  expect(history(wrapper).findAll('.record')).toHaveLength(1)
})

it.each(['首次', '刷新'])('%s失败显示可恢复错误，重试从首页读取；刷新失败保留节点', async mode => {
  if (mode === '首次') inventoryApi.listRecords.mockRejectedValueOnce(new Error('合成读取失败'))
  const wrapper = render()
  await flushPromises()
  const anchor = mode === '刷新' ? history(wrapper).get('.record').element : null
  if (anchor) {
    inventoryApi.listRecords.mockRejectedValueOnce(new Error('合成读取失败'))
    await refresh(wrapper).trigger('click')
    await flushPromises()
    expect(history(wrapper).get('.record').element).toBe(anchor)
  }
  expect(history(wrapper).get('[role="alert"]').text()).toContain('合成读取失败')
  await history(wrapper).get('[role="alert"] button').trigger('click')
  await flushPromises()
  expect(inventoryApi.listRecords).toHaveBeenLastCalledWith({ accountId: 'acc-1', entityType: undefined, cursor: null, limit: 50 })
  expect(history(wrapper).find('[role="alert"]').exists()).toBe(false)
  expect(history(wrapper).findAll('.record')).toHaveLength(1)
})

it('无账号不读历史或写入，提示创建并选择账号', async () => {
  inventoryApi.listAccounts.mockResolvedValueOnce([])
  const wrapper = render()
  await flushPromises()
  expect(history(wrapper).text()).toContain('请先创建并选择一个子账号')
  expect(inventoryApi.listRecords).not.toHaveBeenCalled()
  expect(inventoryApi.deleteRecord).not.toHaveBeenCalled()
  expect(inventoryApi.restoreRecord).not.toHaveBeenCalled()
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
})

it.each(['success', 'failure'])('A→B→A 迟到历史%s不覆盖新A、不解除新请求的loading', async outcome => {
  const old = pending(), current = pending()
  inventoryApi.listRecords.mockReturnValueOnce(old.promise)
  const wrapper = render()
  await flushPromises()
  activeAccount.set('acc-2')
  await flushPromises()
  inventoryApi.listRecords.mockReturnValueOnce(current.promise)
  activeAccount.set('acc-1')
  await flushPromises()
  if (outcome === 'success') old.resolve({ items: [{ ...record, record_id: 'old-A' }], next_cursor: 'old-cursor' })
  else old.reject(new Error('旧A错误'))
  await flushPromises()
  expect(history(wrapper).text()).not.toContain('old-A')
  expect(history(wrapper).text()).not.toContain('旧A错误')
  expect(refresh(wrapper).element.disabled).toBe(true)
  current.resolve({ items: [{ ...record, record_id: 'new-A' }], next_cursor: null })
  await flushPromises()
  expect(history(wrapper).get('.record').text()).toContain('new-A')
  expect(refresh(wrapper).element.disabled).toBe(false)
  expect(inventoryApi.listRecords.mock.calls.map(([params]) => params.accountId)).toEqual(['acc-1', 'acc-2', 'acc-1'])
})

it.each(['取消', '切到B'])('删除确认后%s不写，确认包含账号与摘要', async mode => {
  const confirmation = pending()
  dialog.confirm.mockReturnValueOnce(confirmation.promise)
  const wrapper = render()
  await flushPromises()
  await history(wrapper).get('.record-del').trigger('click')
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ type: 'danger', message: expect.stringContaining('合成账号 A') }))
  expect(inventoryApi.deleteRecord).not.toHaveBeenCalled()
  const reads = inventoryApi.listRecords.mock.calls.length
  for (const width of [390, 768, 1440, 640, 641, 1080, 1081]) viewport.resize(width)
  await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledTimes(1)
  expect(inventoryApi.listRecords).toHaveBeenCalledTimes(reads)
  if (mode === '切到B') { activeAccount.set('acc-2'); await flushPromises() }
  confirmation.resolve(mode !== '取消')
  await flushPromises()
  expect(inventoryApi.deleteRecord).not.toHaveBeenCalled()
})

it.each(['A→B→A', '卸载', '清空账号', '切换游戏', '更换登录身份', '退出登录'])('[P0安全不变量] %s 后迟到删除确认不得再写入', async transition => {
  const confirmation = pending()
  dialog.confirm.mockReturnValueOnce(confirmation.promise)
  const wrapper = render()
  await flushPromises()
  await history(wrapper).get('.record-del').trigger('click')
  if (transition === '卸载') wrapper.unmount()
  else if (transition === '清空账号') activeAccount.set('')
  else if (transition === '切换游戏') activeAccount.setGame('如鸢', 'acc-1')
  else if (transition === '更换登录身份') auth.userInfo = { id: 'synthetic-other-user' }
  else if (transition === '退出登录') auth.isLoggedIn = false
  else {
    activeAccount.set('acc-2')
    await flushPromises()
    activeAccount.set('acc-1')
    await flushPromises()
  }
  await flushPromises()
  const historyReads = inventoryApi.listRecords.mock.calls.length
  const currentReads = inventoryApi.getCurrent.mock.calls.length
  confirmation.resolve(true)
  await flushPromises()
  expect(inventoryApi.deleteRecord).not.toHaveBeenCalled()
  expect(inventoryApi.listRecords).toHaveBeenCalledTimes(historyReads)
  expect(inventoryApi.getCurrent).toHaveBeenCalledTimes(currentReads)
})

it('删除/恢复请求期间resize不重读、状态保留且重复按钮不双写', async () => {
  const wrapper = render()
  await flushPromises()
  const removal = pending()
  inventoryApi.deleteRecord.mockReturnValueOnce(removal.promise)
  await history(wrapper).get('.record-del').trigger('click')
  await flushPromises()
  const anchor = history(wrapper).get('.record').element
  const reads = inventoryApi.listRecords.mock.calls.length
  for (const width of [390, 768, 1440, 320, 640, 641, 1080, 1081]) viewport.resize(width)
  await flushPromises()
  expect(history(wrapper).get('.record').element).toBe(anchor)
  expect(history(wrapper).get('.record-del').element.disabled).toBe(true)
  await history(wrapper).get('.record-del').trigger('click')
  expect(inventoryApi.deleteRecord).toHaveBeenCalledTimes(1)
  expect(inventoryApi.listRecords).toHaveBeenCalledTimes(reads)
  inventoryApi.listRecords.mockResolvedValueOnce({ items: [], next_cursor: null })
  removal.resolve(true)
  await flushPromises()
  const restore = pending()
  inventoryApi.restoreRecord.mockReturnValueOnce(restore.promise)
  await undo(wrapper).trigger('click')
  const afterDelete = inventoryApi.listRecords.mock.calls.length
  viewport.resize(390)
  await undo(wrapper).trigger('click')
  expect(inventoryApi.restoreRecord).toHaveBeenCalledTimes(1)
  expect(inventoryApi.listRecords).toHaveBeenCalledTimes(afterDelete)
  inventoryApi.listRecords.mockResolvedValueOnce({ items: [record], next_cursor: null })
  restore.resolve(true)
  await flushPromises()
  expect(history(wrapper).findAll('.record')).toHaveLength(1)
  expect(undo(wrapper)).toBeUndefined()
})

it('筛选、分页与焦点跨尺寸保留，订阅不重复；卸载后迟到读取不刷新', async () => {
  const unsubscribe = vi.fn()
  subscribeAccountEvents.mockReturnValueOnce(unsubscribe)
  const wrapper = render()
  await flushPromises()
  await filter(wrapper, '道具').trigger('click')
  await flushPromises()
  const button = filter(wrapper, '道具')
  // attach only the tested page so jsdom can track its activeElement.
  document.body.append(wrapper.element)
  button.element.focus()
  const anchor = history(wrapper).get('.record').element
  const reads = inventoryApi.listRecords.mock.calls.length
  const currentReads = inventoryApi.getCurrent.mock.calls.length
  for (const width of [390, 768, 1440, 320, 640, 641, 1080, 1081]) viewport.resize(width)
  await flushPromises()
  expect(filter(wrapper, '道具').attributes('aria-pressed')).toBe('true')
  expect(document.activeElement).toBe(button.element)
  expect(history(wrapper).get('.record').element).toBe(anchor)
  expect(inventoryApi.listRecords).toHaveBeenCalledTimes(reads)
  expect(inventoryApi.getCurrent).toHaveBeenCalledTimes(currentReads)
  expect(subscribeAccountEvents).toHaveBeenCalledTimes(1)
  const late = pending()
  inventoryApi.listRecords.mockReturnValueOnce(late.promise)
  await history(wrapper).get('.load-more').trigger('click')
  wrapper.unmount()
  late.resolve({ items: [record], next_cursor: null })
  await flushPromises()
  expect(unsubscribe).toHaveBeenCalledTimes(1)
  expect(inventoryApi.listRecords).toHaveBeenCalledTimes(reads + 1)
  expect(inventoryApi.getCurrent).toHaveBeenCalledTimes(currentReads)
})

it('增量加载失败保留记录和位置，并可重试', async () => {
  const wrapper = render()
  await flushPromises()
  expect(wrapper.findAll('.record')).toHaveLength(1)
  const anchor = wrapper.get('.record').element
  inventoryApi.listRecords.mockRejectedValueOnce(new Error('网络中断'))
  await wrapper.get('.load-more').trigger('click')
  await flushPromises()
  expect(wrapper.findAll('.record')).toHaveLength(1)
  expect(wrapper.get('.record').element).toBe(anchor)
  expect(wrapper.get('.inventory-inline-state[role="alert"]').text()).toContain('已加载的记录仍可查看')
  inventoryApi.listRecords.mockResolvedValueOnce({ items: [{ ...record, record_id: 'reward:2' }], next_cursor: null })
  await wrapper.get('.inventory-inline-state[role="alert"] button').trigger('click')
  await flushPromises()
  expect(inventoryApi.listRecords).toHaveBeenLastCalledWith({ accountId: 'acc-1', entityType: undefined, cursor: 'next', limit: 50 })
  expect(wrapper.findAll('.record')).toHaveLength(2)
})

it('删除确认可核对内容，失败留页内，成功后可撤销', async () => {
  const wrapper = render()
  await flushPromises()
  inventoryApi.deleteRecord.mockRejectedValueOnce(new Error('删除失败'))
  await wrapper.get('.record-del').trigger('click')
  await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({
    type: 'danger', message: expect.stringContaining('白金币+5'),
  }))
  expect(wrapper.get('.inventory-inline-state[role="alert"]').text()).toContain('删除失败')
  expect(wrapper.findAll('.record')).toHaveLength(1)
  inventoryApi.listRecords.mockResolvedValueOnce({ items: [], next_cursor: null })
  await wrapper.get('.record-del').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('撤销删除')
  inventoryApi.restoreRecord.mockRejectedValueOnce(new Error('恢复暂不可用'))
  await wrapper.findAll('.inventory-inline-state button').find(button => button.text() === '撤销删除').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('撤销删除')
  expect(wrapper.get('.inventory-inline-state[role="alert"]').text()).toContain('恢复暂不可用')
  inventoryApi.listRecords.mockResolvedValueOnce({ items: [record], next_cursor: null })
  await wrapper.findAll('.inventory-inline-state button').find(button => button.text() === '撤销删除').trigger('click')
  await flushPromises()
  expect(inventoryApi.restoreRecord).toHaveBeenCalledWith('reward:1', 'acc-1')
  expect(wrapper.findAll('.record')).toHaveLength(1)
  expect(wrapper.text()).not.toContain('撤销删除')
})

it('目录同步失败显示重试，历史真正为空时说明记录来源', async () => {
  inventoryApi.getCatalog.mockRejectedValueOnce(new Error('offline'))
  inventoryApi.listRecords.mockResolvedValue({ items: [], next_cursor: null })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('.inventory-inline-state[role="alert"]').text()).toContain('目录同步失败')
  expect(wrapper.text()).toContain('更新库存、记录奖励或导入本地报告')
  await wrapper.get('.inventory-inline-state[role="alert"] button').trigger('click')
  await flushPromises()
  expect(inventoryApi.getCatalog).toHaveBeenCalledTimes(2)
  expect(wrapper.find('.inventory-inline-state[role="alert"]').exists()).toBe(false)
})

it('密探目录失败时不显示无版本标记的本地心纸目录，重试后按如鸢筛选', async () => {
  localStorage.setItem('inventory-tabs', 'manifest')
  inventoryApi.listAccounts.mockResolvedValue([{ id: 'acc-1', name: '如鸢账号', game: '如鸢' }])
  getOperatorCatalog.mockRejectedValue(new Error('offline'))
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.manifest-type-switch button[aria-label="切换到密探心纸"]').trigger('click')
  await flushPromises()

  expect(wrapper.text()).toContain('密探目录同步失败，暂不能查看或编辑心纸')
  expect(wrapper.find('.manifest-agents').exists()).toBe(false)

  getOperatorCatalog.mockResolvedValue({ operators: [
    { id: 'char_shared', name: '共同密探', rarity: 5, games: ['如鸢', '代号鸢'] },
    { id: 'char_daihao', name: '代号鸢密探', rarity: 5, games: ['代号鸢'] },
  ] })
  await wrapper.findAll('.inventory-inline-state button').find(node => node.text() === '重试同步').trigger('click')
  await flushPromises()

  expect(wrapper.get('.agent-result').text()).toContain('1 / 1')
  expect(wrapper.text()).toContain('共同密探')
  expect(wrapper.text()).not.toContain('代号鸢密探')
})

it('升级消耗历史明确标记且不可单独删除', async () => {
  inventoryApi.listRecords.mockResolvedValue({ items: [{ ...record, record_type: 'consumption_delta' }], next_cursor: null })
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('.record').text()).toContain('升级消耗')
  expect(wrapper.get('.record').text()).toContain('白金币−5')
  expect(wrapper.find('.record-del').exists()).toBe(false)
})

it('库存图标操作在触屏前有可见说明', async () => {
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('.subsection-edit').text()).toBe('编辑')
  await wrapper.get('.manifest-type-switch button[aria-label="切换到密探心纸"]').trigger('click')
  await flushPromises()
  expect(wrapper.get('.agent-favorite-help').text()).toContain('星标')
  expect(wrapper.get('.agent-sort-direction').text()).toContain('降序')
})

it('心纸编辑沿用清单的关注、排序与分组顺序', async () => {
  localStorage.setItem('inventory-tabs', 'manifest')
  window.scrollTo = vi.fn()
  getOperatorCatalog.mockResolvedValue({ operators: [
    { id: 'char_001_yin', name: '阴密探', rarity: 5, prof: ['阴'], games: ['代号鸢'] },
    { id: 'char_002_yang', name: '阳密探', rarity: 5, prof: ['阳'], games: ['代号鸢'] },
    { id: 'char_003_huo', name: '火密探', rarity: 5, prof: ['火'], games: ['代号鸢'] },
  ] })
  inventoryApi.listAgentFavorites.mockResolvedValue({ agent_ids: ['char_001_yin'] })
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.manifest-type-switch button[aria-label="切换到密探心纸"]').trigger('click')
  await flushPromises()

  const names = selector => wrapper.findAll(selector).map(node => node.get('.slot-name').text())
  const defaultOrder = names('.agent-card')
  expect(defaultOrder).toEqual(['阴密探', '火密探', '阳密探'])
  await wrapper.get('.inventory-entry').trigger('click')
  expect(names('.stock-edit-slot')).toEqual(defaultOrder)
  expect(wrapper.get('.agent-sort-control summary').text()).toContain('实装顺序')
  await wrapper.get('.manifest-edit-actions button').trigger('click')

  await wrapper.findAll('.agent-group-control .agent-menu-options button')
    .find(node => node.text().includes('按属性')).trigger('click')
  const groupedOrder = names('.agent-card')
  expect(groupedOrder).toEqual(['阳密探', '阴密探', '火密探'])
  await wrapper.get('.inventory-entry').trigger('click')
  expect(names('.stock-edit-slot')).toEqual(groupedOrder)
})

it('密探职业显示中文，金色快捷筛选只保留绝密', async () => {
  localStorage.setItem('inventory-tabs', 'manifest')
  getOperatorCatalog.mockResolvedValue({ operators: [
    { id: 'char_001_gold', name: '金色密探', rarity: 5, prof: ['阳'], sub_prof: ['shenji'], games: ['代号鸢'] },
    { id: 'char_002_purple', name: '紫色密探', rarity: 4, prof: ['阴'], sub_prof: ['guidao'], games: ['代号鸢'] },
  ] })
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.manifest-type-switch button[aria-label="切换到密探心纸"]').trigger('click')
  await flushPromises()

  expect(wrapper.get('.agent-filter-panel').text()).toContain('神纪')
  expect(wrapper.get('.agent-filter-panel').text()).not.toContain('shenji')
  expect(wrapper.get('.agent-result').text()).toContain('2 / 2')

  await wrapper.get('.agent-gold-filter input').setValue(true)
  expect(wrapper.get('.agent-result').text()).toContain('1 / 2')
  expect(wrapper.get('.agent-gold-filter input').element.checked).toBe(true)

  await wrapper.get('.agent-gold-filter input').setValue(false)
  expect(wrapper.get('.agent-result').text()).toContain('2 / 2')
})
