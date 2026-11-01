import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import InventoryPage from '../src/pages/inventory/index.vue'
import * as inventoryApi from '../src/api/inventory.js'
import { getOperatorCatalog } from '../src/api/operator.js'
import { dialog } from '../src/utils/dialog.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { auth } from '../src/store/auth.js'
import { subscribeAccountEvents } from '../src/store/accountEvents.js'
import { installViewport } from '../test-support/viewport.js'
import InventoryRecordsWorkspace from '../src/components/inventory/InventoryRecordsWorkspace.vue'
import RewardEntryWorkspace from '../src/components/inventory/RewardEntryWorkspace.vue'
import ResourceBalanceReport from '../src/components/inventory/ResourceBalanceReport.vue'
import AcquiredPeriodReport from '../src/components/inventory/AcquiredPeriodReport.vue'
import InventoryLayout from '../src/components/inventory/InventoryLayout.vue'
import InventoryWorkspaceTabs from '../src/components/inventory/InventoryWorkspaceTabs.vue'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: true, userInfo: { id: 'synthetic-user' } }) }
})
vi.mock('vue-router', async original => ({ ...await original(), onBeforeRouteLeave: () => {}, onBeforeRouteUpdate: () => {} }))
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

async function removeButton(wrapper) {
  return history(wrapper).get('.record-del')
}

describe.each([1440, 390])('操作历史 %ipx', width => {

function render(stubs = {}, directives = {}) {
  return mount(InventoryPage, { global: { plugins: [createPinia()],
    stubs: { OnboardingGuide: true,
      RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true,
      AccountWorkspace: true, DataAccountContextBar: true, ArchiveExchangePanel: true,
      ResourceBalanceReport: true, AcquiredPeriodReport: true, RewardEntryWorkspace: true,
      ...stubs,
    },
    directives: { reveal: () => {}, ...directives },
  } })
}

beforeEach(() => {
  vi.resetAllMocks()
  viewport = installViewport(width)
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

it('首屏清单与工作区内容不依赖滚动观察器才显示', async () => {
  localStorage.setItem('inventory-tabs', 'manifest')
  inventoryApi.getCurrent.mockResolvedValue([{ account_id: 'acc-1', entity_type: 'item', full_baseline_at: record.effective_at, entries: { baijinbi: { count: 5 } } }])
  inventoryApi.getAcquired.mockResolvedValue({ acquired: {} })
  // 模拟尚未收到 intersection 回调，不以 jsdom 伪造可见比例。
  const wrapper = render({}, { reveal: { mounted(element) { element.classList.add('rv'); element.style.opacity = '0' } } })
  await flushPromises()
  expect(wrapper.get('.backpack.manifest-items').classes()).not.toContain('rv')
  expect(wrapper.get('.backpack.manifest-items').isVisible()).toBe(true)
  for (const tab of ['records', 'acquired', 'manifest']) {
    await wrapper.get('#inventory-tab-' + tab).trigger('click'); await flushPromises()
    expect(wrapper.get('#inventory-panel-' + tab).isVisible()).toBe(true)
    expect(wrapper.get('.inventory-main').findAll('.rv')).toHaveLength(0)
  }
})

it('真实壳层与工作区导航保留手动键盘激活，跨壳层断点不重建或发请求', async () => {
  const wrapper = render(); document.body.append(wrapper.element)
  await flushPromises()
  const layout = wrapper.getComponent(InventoryLayout).vm.$
  const navigation = wrapper.getComponent(InventoryWorkspaceTabs).vm.$
  const current = wrapper.get('#inventory-tab-records')
  const acquired = wrapper.get('#inventory-tab-acquired')
  current.element.focus()
  await current.trigger('keydown', { key: 'ArrowLeft' })
  expect(document.activeElement).toBe(acquired.element)
  expect(current.attributes('aria-selected')).toBe('true')
  expect(acquired.attributes('aria-selected')).toBe('false')
  expect(inventoryApi.getAcquired).not.toHaveBeenCalled()
  const reads = [inventoryApi.listRecords.mock.calls.length, inventoryApi.getCurrent.mock.calls.length]
  for (const next of [640, 641, 1080, 1081, 390, 1440]) {
    viewport.resize(next); await flushPromises()
    expect(wrapper.getComponent(InventoryLayout).vm.$).toBe(layout)
    expect(wrapper.getComponent(InventoryWorkspaceTabs).vm.$).toBe(navigation)
    expect(document.activeElement).toBe(acquired.element)
    expect(wrapper.findAll('main#main-content')).toHaveLength(1)
    expect(wrapper.findAll('[role="tablist"][aria-label="库存工作区"]')).toHaveLength(1)
    expect([inventoryApi.listRecords.mock.calls.length, inventoryApi.getCurrent.mock.calls.length]).toEqual(reads)
  }
  wrapper.get('main').element.setAttribute('tabindex', '-1')
  wrapper.get('main').element.focus()
  expect(current.element.tabIndex).toBe(0)
  expect(acquired.element.tabIndex).toBe(-1)
  expect(inventoryApi.getAcquired).not.toHaveBeenCalled()
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
  await (await removeButton(wrapper)).trigger('click')
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
  await (await removeButton(wrapper)).trigger('click')
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
  await (await removeButton(wrapper)).trigger('click')
  await flushPromises()
  const reads = inventoryApi.listRecords.mock.calls.length
  for (const nextWidth of [390, 768, 1440, 320, 640, 641, 1080, 1081]) {
    viewport.resize(nextWidth)
    await flushPromises()
    expect(history(wrapper).findAll('.record-list')).toHaveLength(1)
    expect(history(wrapper).get('.record').text()).toContain(record.record_id)
    expect(history(wrapper).get('.record-del').element.disabled).toBe(true)
  }
  expect(history(wrapper).get('.record-del').element.disabled).toBe(true)
  await (await removeButton(wrapper)).trigger('click')
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

describe.each(['delete', 'restore'])('%s 写入完成上下文', action => {
  const writeApi = () => action === 'delete' ? inventoryApi.deleteRecord : inventoryApi.restoreRecord

  async function startWrite(wrapper, write) {
    if (action === 'restore') {
      inventoryApi.listRecords.mockResolvedValueOnce({ items: [], next_cursor: null })
      await (await removeButton(wrapper)).trigger('click')
      await flushPromises()
      expect(undo(wrapper)).toBeDefined()
    }
    writeApi().mockReturnValueOnce(write.promise)
    const button = action === 'delete' ? await removeButton(wrapper) : undo(wrapper)
    await button.trigger('click')
    await flushPromises()
    expect(writeApi()).toHaveBeenLastCalledWith(record.record_id, 'acc-1')
    expect(button.element.disabled).toBe(true)
    const writes = writeApi().mock.calls.length
    await button.trigger('click')
    expect(writeApi()).toHaveBeenCalledTimes(writes)
  }

  async function invalidate(wrapper, transition) {
    if (transition === '卸载') wrapper.unmount()
    else if (transition === 'A→B→A') {
      activeAccount.set('acc-2')
      activeAccount.set('acc-1')
    } else if (transition === '登录身份') auth.userInfo = { id: 'synthetic-other-user' }
    else if (transition === '游戏') activeAccount.setGame('如鸢', 'acc-1')
    else if (transition === '退出登录') auth.isLoggedIn = false
    else activeAccount.set('')
    await flushPromises()
  }

  const settle = (write, outcome) => outcome === 'success'
    ? write.resolve(true) : write.reject(new Error('旧写入失败'))
  const reads = () => [inventoryApi.listRecords.mock.calls.length, inventoryApi.getCurrent.mock.calls.length,
    inventoryApi.getAcquired.mock.calls.length, inventoryApi.listAccounts.mock.calls.length]
  // 卸载后 DOM 不再渲染，保留 setup 状态引用以检测迟到错误/提示回写。
  const stateOf = state => ({ records: state.recordsList, notices: [...state.deletedRecordNotices],
    error: state.recordsActionError, busy: state.recordsBusyId, search: state.acquiredSearch })

  it.each([
    ['卸载', 'success'], ['卸载', 'failure'],
    ['A→B→A', 'success'], ['A→B→A', 'failure'],
    ['登录身份', 'success'], ['登录身份', 'failure'],
    ['游戏', 'success'], ['游戏', 'failure'],
    ['退出登录', 'failure'], ['清空账号', 'success'],
  ])('%s 后迟到 %s 不回写、不刷新，旧锁在失效时释放', async (transition, outcome) => {
    const wrapper = render()
    await flushPromises()
    const state = wrapper.vm.$.setupState
    const write = pending()
    await startWrite(wrapper, write)
    inventoryApi.listRecords.mockResolvedValue({ items: [{ ...record, record_id: 'new-context' }], next_cursor: null })
    await invalidate(wrapper, transition)
    const busyAfterInvalidation = state.recordsBusyId
    const before = stateOf(state)
    const readCounts = reads()
    settle(write, outcome)
    await flushPromises()
    expect(reads()).toEqual(readCounts)
    expect(stateOf(state)).toEqual(before)
    expect(busyAfterInvalidation).toBe('')
    if (transition !== '卸载') {
      expect(state.deletedRecordNotices).toEqual([])
      expect(history(wrapper).find('[role="alert"]').exists()).toBe(false)
    }
    expect(writeApi()).toHaveBeenCalledTimes(1)
  })

  it.each(['success', 'failure'])('旧操作 %s 不清除较新操作的锁，新操作结束后可重试', async outcome => {
    const wrapper = render()
    await flushPromises()
    const oldWrite = pending()
    await startWrite(wrapper, oldWrite)
    await invalidate(wrapper, 'A→B→A')
    expect((await removeButton(wrapper)).element.disabled).toBe(false)
    const newWrite = pending()
    await startWrite(wrapper, newWrite)
    const readCounts = reads()
    settle(oldWrite, outcome)
    await flushPromises()
    expect(reads()).toEqual(readCounts)
    expect(history(wrapper).find('[role="alert"]').exists()).toBe(false)
    const button = action === 'delete' ? await removeButton(wrapper) : undo(wrapper)
    expect(button.element.disabled).toBe(true)
    await button.trigger('click')
    expect(writeApi()).toHaveBeenCalledTimes(2)
    newWrite.reject(new Error('新写入失败'))
    await flushPromises()
    expect(history(wrapper).get('[role="alert"]').text()).toContain('新写入失败')
    expect(button.element.disabled).toBe(false)
    inventoryApi.listRecords.mockResolvedValueOnce({ items: action === 'delete' ? [] : [record], next_cursor: null })
    await button.trigger('click')
    await flushPromises()
    expect(writeApi()).toHaveBeenCalledTimes(3)
    expect(history(wrapper).find('[role="alert"]').exists()).toBe(false)
    expect(Boolean(undo(wrapper))).toBe(action === 'delete')
  })

  it.each([
    ['history', '卸载'], ['history', 'A→B→A'],
    ['current', '卸载'], ['current', '登录身份'],
  ])('%s 刷新 pending 时%s，完成后不继续刷新或清空新统计', async (stage, transition) => {
    const wrapper = render()
    await flushPromises()
    const state = wrapper.vm.$.setupState
    const write = pending()
    const read = pending()
    await startWrite(wrapper, write)
    const readApi = stage === 'history' ? inventoryApi.listRecords : inventoryApi.getCurrent
    readApi.mockReturnValueOnce(read.promise)
    write.resolve(true)
    await flushPromises()
    expect(state.recordsBusyId).toBe(record.record_id)
    await invalidate(wrapper, transition)
    // 模拟新上下文中已输入的统计筛选；旧刷新结束不得再失效它。
    state.acquiredSearch = '新上下文筛选'
    const before = stateOf(state)
    const readCounts = reads()
    read.resolve(stage === 'history' ? { items: [record], next_cursor: null } : [])
    await flushPromises()
    expect(reads()).toEqual(readCounts)
    expect(stateOf(state)).toEqual(before)
  })

  it('有效成功只刷新历史/当前库存一次并失效统计，失败不刷新且释放锁', async () => {
    const wrapper = render()
    await flushPromises()
    const state = wrapper.vm.$.setupState
    const write = pending()
    await startWrite(wrapper, write)
    state.acquiredSearch = '旧统计筛选'
    const readCounts = reads()
    inventoryApi.listRecords.mockResolvedValueOnce({ items: action === 'delete' ? [] : [record], next_cursor: null })
    write.resolve(true)
    await flushPromises()
    expect(reads()).toEqual([readCounts[0] + 1, readCounts[1] + 1, readCounts[2], readCounts[3]])
    expect(state.acquiredSearch).toBe('')
    expect(state.recordsBusyId).toBe('')
    expect(Boolean(undo(wrapper))).toBe(action === 'delete')
    expect(history(wrapper).findAll('.record')).toHaveLength(action === 'delete' ? 0 : 1)

    const failureApi = action === 'delete' ? inventoryApi.restoreRecord : inventoryApi.deleteRecord
    failureApi.mockRejectedValueOnce(new Error('当前操作失败'))
    const beforeFailure = reads()
    const button = action === 'delete' ? undo(wrapper) : await removeButton(wrapper)
    await button.trigger('click')
    await flushPromises()
    expect(history(wrapper).get('[role="alert"]').text()).toContain('当前操作失败')
    expect(reads()).toEqual(beforeFailure)
    expect(state.recordsBusyId).toBe('')
  })
})

it.each([
  ['record_already_exists', '同编号记录已重新导入，无法撤销；现有库存未更改'],
  ['deleted_record_not_found', '这条删除备份不存在或已恢复，无法撤销'],
])('恢复 %s 保留准确错误与撤销入口，游戏失效清除旧提示', async (code, message) => {
  const wrapper = render()
  await flushPromises()
  inventoryApi.listRecords.mockResolvedValueOnce({ items: [], next_cursor: null })
  await (await removeButton(wrapper)).trigger('click')
  await flushPromises()
  const reads = [inventoryApi.listRecords.mock.calls.length, inventoryApi.getCurrent.mock.calls.length]
  inventoryApi.restoreRecord.mockRejectedValueOnce(Object.assign(new Error('原始错误'), { code }))
  await undo(wrapper).trigger('click')
  await flushPromises()
  expect(history(wrapper).get('[role="alert"]').text()).toBe(message)
  expect(undo(wrapper).element.disabled).toBe(false)
  expect([inventoryApi.listRecords.mock.calls.length, inventoryApi.getCurrent.mock.calls.length]).toEqual(reads)
  activeAccount.setGame('如鸢', 'acc-1')
  await flushPromises()
  expect(history(wrapper).find('[role="alert"]').exists()).toBe(false)
  expect(undo(wrapper)).toBeUndefined()
})

it('并行迟到确认只允许一个删除写入，取消不释放已有写入锁', async () => {
  const wrapper = render()
  await flushPromises()
  const confirmations = [pending(), pending(), pending()]
  for (const confirmation of confirmations) dialog.confirm.mockReturnValueOnce(confirmation.promise)
  const write = pending()
  inventoryApi.deleteRecord.mockReturnValueOnce(write.promise)
  const button = await removeButton(wrapper)
  for (const _confirmation of confirmations) await button.trigger('click')
  expect(dialog.confirm).toHaveBeenCalledTimes(3)
  confirmations[0].resolve(true)
  await flushPromises()
  confirmations[1].resolve(true)
  confirmations[2].resolve(false)
  await flushPromises()
  expect(inventoryApi.deleteRecord).toHaveBeenCalledTimes(1)
  expect(button.element.disabled).toBe(true)
  write.reject(new Error('当前删除失败'))
  await flushPromises()
  expect(button.element.disabled).toBe(false)
  expect(history(wrapper).get('[role="alert"]').text()).toContain('当前删除失败')
})

it('筛选、分页与焦点跨尺寸保留，订阅不重复；卸载后迟到读取不刷新', async () => {
  const unsubscribe = vi.fn()
  subscribeAccountEvents.mockReturnValueOnce(unsubscribe)
  const wrapper = render()
  await flushPromises()
  const workspace = wrapper.getComponent(InventoryRecordsWorkspace).vm.$
  await filter(wrapper, '道具').trigger('click')
  await flushPromises()
  const button = filter(wrapper, '道具')
  // attach only the tested page so jsdom can track its activeElement.
  document.body.append(wrapper.element)
  button.element.focus()
  const reads = inventoryApi.listRecords.mock.calls.length
  const currentReads = inventoryApi.getCurrent.mock.calls.length
  for (const nextWidth of [390, 768, 1440, 320, 640, 641, 1080, 1081]) {
    viewport.resize(nextWidth)
    await flushPromises()
    expect(history(wrapper).findAll('.record-list')).toHaveLength(1)
    expect(wrapper.getComponent(InventoryRecordsWorkspace).vm.$).toBe(workspace)
    expect(history(wrapper).get('.record').text()).toContain(record.record_id)
    expect(document.activeElement).toBe(button.element)
  }
  expect(filter(wrapper, '道具').attributes('aria-pressed')).toBe('true')
  expect(document.activeElement).toBe(button.element)
  expect(history(wrapper).get('.record').text()).toContain(record.record_id)
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

it('历史报告入口连接唯一真实奖励实例，跨断点保留文本草稿与焦点且不写入', async () => {
  inventoryApi.getCatalog.mockResolvedValue({ entities: [{ id: 'baijinbi', name: '白金币', entity_type: 'item' }] })
  const wrapper = render({ RewardEntryWorkspace: false })
  document.body.append(wrapper.element)
  await flushPromises()
  const reportWorkspaces = () => wrapper.findAllComponents(RewardEntryWorkspace).filter(component => !component.props('compactDaily'))
  expect(reportWorkspaces()).toHaveLength(1)
  const reward = reportWorkspaces()[0].vm.$
  const opener = history(wrapper).get('.records-report-entry')
  expect(opener.element.disabled).toBe(false)
  await opener.trigger('click'); await flushPromises()
  expect(opener.attributes('aria-expanded')).toBe('true')
  document.querySelector('.paste-toggle').click(); await flushPromises()
  const textarea = document.querySelector('#reward-report-text textarea')
  textarea.value = '尚未解析的合成报告草稿'
  textarea.dispatchEvent(new Event('input', { bubbles: true })); textarea.focus()
  await flushPromises()
  const reads = [inventoryApi.getCatalog, getOperatorCatalog, inventoryApi.getCurrent, inventoryApi.listRecords].map(fn => fn.mock.calls.length)
  for (const next of [640, 641, 768, 1081, 390, 1440]) {
    viewport.resize(next); await flushPromises()
    expect(reportWorkspaces()).toHaveLength(1)
    expect(reportWorkspaces()[0].vm.$).toBe(reward)
    expect(document.querySelectorAll('#reward-entry-panel')).toHaveLength(1)
    expect(document.querySelector('#reward-report-text textarea')).toBe(textarea)
    expect(textarea.value).toBe('尚未解析的合成报告草稿')
    expect(document.activeElement).toBe(textarea)
    expect([inventoryApi.getCatalog, getOperatorCatalog, inventoryApi.getCurrent, inventoryApi.listRecords].map(fn => fn.mock.calls.length)).toEqual(reads)
  }
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  expect(inventoryApi.deleteRecord).not.toHaveBeenCalled()
  expect(inventoryApi.restoreRecord).not.toHaveBeenCalled()
  document.querySelector('[aria-label="关闭奖励工作台"]').click(); await flushPromises()
  expect(document.querySelector('#reward-entry-panel')).toBeNull()
  expect(opener.attributes('aria-expanded')).toBe('false')
  expect(document.activeElement).toBe(opener.element)
})

it('统计默认三时段渐进筛选，自定义保留日期校验，扩展预设使用原查询', async () => {
  localStorage.setItem('inventory-tabs', 'acquired')
  inventoryApi.getAcquired.mockResolvedValue({ acquired: {} })
  inventoryApi.listRecords.mockResolvedValue({ items: [], next_cursor: null })
  const wrapper = render()
  document.body.append(wrapper.element); await flushPromises()
  expect(wrapper.get('.acquired-bar').classes()).not.toContain('is-custom')
  const reads = inventoryApi.getAcquired.mock.calls.length
  await wrapper.get('.custom-range-toggle').trigger('click')
  expect(wrapper.get('.custom-range-toggle').attributes('aria-expanded')).toBe('true')
  expect(wrapper.get('.acquired-bar').classes()).toContain('is-custom')
  expect(inventoryApi.getAcquired.mock.calls.length).toBe(reads)
  await wrapper.get('#acquired-range-from').setValue('2026-10-17')
  await wrapper.get('#acquired-range-to').setValue('2026-10-16')
  await wrapper.get('.acquired-submit').trigger('click'); await flushPromises()
  expect(wrapper.vm.$.setupState.acquiredError).toBe('请选择有效的起止日期')
  expect(inventoryApi.getAcquired.mock.calls.length).toBe(reads)
  expect(wrapper.findAll('.range-more-options button').map(button => button.text())).toEqual(['本周', '上周', '本月', '上月'])
  await wrapper.get('.range-more-options button').trigger('click'); await flushPromises()
  expect(wrapper.get('.acquired-bar').classes()).not.toContain('is-custom')
  expect(inventoryApi.getAcquired.mock.calls.length).toBe(reads + 2)
  const cached = inventoryApi.getAcquired.mock.calls.length
  await wrapper.get('#inventory-tab-manifest').trigger('click'); await flushPromises()
  await wrapper.get('#inventory-tab-acquired').trigger('click'); await flushPromises()
  expect(inventoryApi.getAcquired.mock.calls.length).toBe(cached)
  await wrapper.vm.$.setupState.focusResourceRange()
  expect(wrapper.get('.acquired-bar').classes()).toContain('is-custom')
  expect(document.activeElement).toBe(wrapper.get('#acquired-range-from').element)
})

it('历史紧凑下拉沿用全部/道具/心纸筛选，导入入口仍连接原工作台', async () => {
  const wrapper = render(); await flushPromises()
  const select = wrapper.get('.records-filter-select')
  expect(select.findAll('option').map(option => option.element.value)).toEqual(['all', 'item', 'agent'])
  await select.setValue('agent'); await flushPromises()
  expect(wrapper.vm.$.setupState.recordsEntityType).toBe('agent')
  expect(inventoryApi.listRecords.mock.calls.at(-1)[0]).toMatchObject({ accountId: 'acc-1', entityType: 'agent' })
  expect(wrapper.get('.records-report-entry').text()).toBe('导入本地报告')
})

it('真实统计父级跨断点保留月历日期、趋势固定点与排行选择，resize 零额外请求', async () => {
  localStorage.setItem('inventory-tabs', 'acquired')
  const effectiveAt = new Date().toISOString()
  inventoryApi.getAcquired.mockResolvedValue({ acquired: { baijinbi: 5 } })
  inventoryApi.listRecords.mockResolvedValue({ items: [
    { ...record, record_id: 'snapshot:stats', record_type: 'stock_snapshot', effective_at: effectiveAt, snapshot_scope: 'full', entries: [{ id: 'baijinbi', count: 50 }, { id: 'zhuyu', count: 1 }] },
    { ...record, effective_at: effectiveAt },
  ], next_cursor: null })
  const wrapper = render({ ResourceBalanceReport: false, AcquiredPeriodReport: false })
  document.body.append(wrapper.element); await flushPromises()
  const resource = wrapper.getComponent(ResourceBalanceReport)
  const instance = resource.vm.$
  const day = resource.findAll('.day').find(node => node.find('.resource-row').exists())
  expect(day).toBeDefined()
  await day.trigger('click'); day.element.focus()
  const detail = resource.get('.day-detail').text()
  const calls = () => [inventoryApi.getAcquired, inventoryApi.listRecords, inventoryApi.getCurrent, inventoryApi.listAgentFavorites].map(fn => fn.mock.calls.length)
  const reads = calls()
  for (const next of [760, 761, 980, 1081, 390, 1440]) {
    viewport.resize(next); await flushPromises()
    expect(wrapper.getComponent(ResourceBalanceReport).vm.$).toBe(instance)
    expect(resource.get('.day-detail').text()).toBe(detail)
    expect(day.attributes('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(day.element)
    expect(calls()).toEqual(reads)
  }
  await resource.findAll('.view-switch button').find(node => node.text() === '趋势').trigger('click')
  const point = resource.get('circle[role="button"]')
  await point.trigger('click'); point.element.focus()
  const tooltip = resource.get('.point-tooltip').text()
  for (const next of [760, 761, 390, 1440]) {
    viewport.resize(next); await flushPromises()
    expect(resource.get('.point-tooltip').text()).toBe(tooltip)
    expect(point.attributes('aria-pressed')).toBe('true')
    expect(document.activeElement).toBe(point.element)
    expect(resource.get('.trend-plot svg').attributes('viewBox')).toBe(`0 0 ${next <= 760 ? 450 : 900} 320`)
    expect(calls()).toEqual(reads)
  }
  await wrapper.get('[aria-label="据点收获统计账簿"]').trigger('click'); await flushPromises()
  const acquired = wrapper.getComponent(AcquiredPeriodReport)
  const acquiredInstance = acquired.vm.$
  const goldOnly = acquired.get('.ranking-rarity-checkbox input')
  await goldOnly.setValue(true); goldOnly.element.focus()
  for (const next of [360, 440, 760, 761, 980, 1440]) {
    viewport.resize(next); await flushPromises()
    expect(wrapper.getComponent(AcquiredPeriodReport).vm.$).toBe(acquiredInstance)
    expect(goldOnly.element.checked).toBe(true)
    expect(document.activeElement).toBe(goldOnly.element)
    expect(calls()).toEqual(reads)
  }
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
})

it('删除确认可核对内容，失败留页内，成功后可撤销', async () => {
  const wrapper = render()
  await flushPromises()
  inventoryApi.deleteRecord.mockRejectedValueOnce(new Error('删除失败'))
  await (await removeButton(wrapper)).trigger('click')
  await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({
    type: 'danger', message: expect.stringContaining('白金币+5'),
  }))
  expect(wrapper.get('.inventory-inline-state[role="alert"]').text()).toContain('删除失败')
  expect(wrapper.findAll('.record')).toHaveLength(1)
  inventoryApi.listRecords.mockResolvedValueOnce({ items: [], next_cursor: null })
  await (await removeButton(wrapper)).trigger('click')
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

})
