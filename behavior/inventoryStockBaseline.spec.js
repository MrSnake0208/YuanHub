import { createPinia } from 'pinia'
import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import InventoryPage from '../src/pages/inventory/index.vue'
import * as inventoryApi from '../src/api/inventory.js'
import { getOperatorCatalog } from '../src/api/operator.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { auth } from '../src/store/auth.js'
import { dialog } from '../src/utils/dialog.js'
import { subscribeAccountEvents } from '../src/store/accountEvents.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ isLoggedIn: true, userInfo: { id: 'user-fixture' } }) }
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

const fullBaseline = '2026-10-04T08:00:00Z'
const fullStock = (accountId = 'acc-a', entries = {}) => [{ account_id: accountId, entity_type: 'item', full_baseline_at: fullBaseline, entries }]
const pending = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const openReport = vi.fn()
const rewardStub = defineComponent({
  setup(_, { expose }) {
    expose({ openReport })
    return () => h('div', { class: 'reward-workspace-stub' })
  },
})
function render(options = {}) {
  return mount(InventoryPage, { ...options, global: { plugins: [createPinia()],
    stubs: {
      RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true,
      AccountWorkspace: true, DataAccountContextBar: true, ArchiveExchangePanel: true,
      AcquiredPeriodReport: true, RewardEntryWorkspace: rewardStub,
    },
    directives: { reveal: () => {} },
  } })
}
const save = wrapper => wrapper.get('.manifest-edit-actions .primary')
const confirmation = wrapper => wrapper.get('.stock-baseline-confirmation input')
async function enterStockEditor(wrapper) {
  await flushPromises()
  await wrapper.get('.inventory-entry').trigger('click')
}

beforeEach(() => {
  vi.resetAllMocks()
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  window.scrollTo = vi.fn()
  auth.isLoggedIn = true
  auth.userInfo = { id: 'user-fixture' }
  localStorage.setItem('inventory-tabs', 'manifest')
  activeAccount.set('acc-a')
  activeAccount.setGame('代号鸢', 'acc-a')
  activeAccount.setGame('代号鸢', 'acc-b')
  inventoryApi.getCatalog.mockResolvedValue({ entities: [] })
  getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'char_001_test', name: '测试密探', rarity: 5, games: ['代号鸢'] }] })
  inventoryApi.getCurrent.mockResolvedValue([])
  inventoryApi.getAcquired.mockResolvedValue({ acquired: {} })
  inventoryApi.listAccounts.mockResolvedValue([
    { id: 'acc-a', name: '账号 A', game: '代号鸢' }, { id: 'acc-b', name: '账号 B', game: '代号鸢' },
  ])
  inventoryApi.listAgentFavorites.mockResolvedValue([])
  inventoryApi.listRecords.mockResolvedValue({ items: [], next_cursor: null })
  inventoryApi.importInventory.mockResolvedValue({ accepted: 1, duplicates: 0 })
  subscribeAccountEvents.mockImplementation(() => () => {})
  dialog.confirm.mockResolvedValue(true)
})

it('只读初始化不写库存，不用登录状态宣称已同步', async () => {
  const wrapper = render({ attachTo: document.body })
  await flushPromises()
  expect(wrapper.findComponent({ name: 'DataAccountContextBar' }).props('isLoggedIn')).toBe(true)
  expect(wrapper.get('.tool-summary').text()).not.toContain('已同步')
  expect(wrapper.get('.tool-summary time').attributes('datetime')).toBeTruthy()
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  expect(wrapper.get('.inventory-setup').text()).toContain('尚未建立库存')
  expect(wrapper.get('.inventory-setup .inventory-entry').text()).toBe('开始首次盘点')
  expect(wrapper.get('.inventory-tabs').isVisible()).toBe(false)
  await wrapper.get('.inventory-setup .link').trigger('click')
  expect(wrapper.get('.inventory-tabs').isVisible()).toBe(true)
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('已建立全零基准属于有效库存，更新时间附近保留更新入口', async () => {
  inventoryApi.getCurrent.mockResolvedValue(fullStock())
  const wrapper = render()
  await flushPromises()
  expect(wrapper.find('.inventory-setup').exists()).toBe(false)
  expect(wrapper.get('.inventory-freshness time').attributes('datetime')).toBe(fullBaseline)
  expect(wrapper.get('.inventory-freshness .inventory-entry').text()).toBe('更新库存')
  expect(wrapper.get('.inventory-freshness .inventory-entry').element.disabled).toBe(false)
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('首次全零库存必须明确确认，提交完整零快照且建立基准后不允许无变化重复保存', async () => {
  const wrapper = render()
  await enterStockEditor(wrapper)
  expect(save(wrapper).element.disabled).toBe(true)
  expect(wrapper.findAll('.stock-count-input').every(input => input.element.value === '0')).toBe(true)
  await confirmation(wrapper).setValue(true)
  expect(save(wrapper).text()).toContain('确认盘点')
  expect(save(wrapper).element.disabled).toBe(false)
  inventoryApi.getCurrent.mockResolvedValue(fullStock())
  await save(wrapper).trigger('click')
  await flushPromises()
  expect(inventoryApi.importInventory).toHaveBeenCalledTimes(1)
  expect(inventoryApi.importInventory.mock.calls[0][0].records[0]).toMatchObject({
    account_id: 'acc-a', entity_type: 'item', record_type: 'stock_snapshot', snapshot_scope: 'full', entries: [],
  })
  expect(wrapper.text()).toContain('库存已更新')
  await wrapper.get('.inventory-entry').trigger('click')
  expect(wrapper.find('.stock-baseline-confirmation').exists()).toBe(false)
  expect(save(wrapper).element.disabled).toBe(true)
})

it('局部分组不能通过全零确认建立整个库存的基准', async () => {
  const wrapper = render()
  await flushPromises()
  await wrapper.findAll('.subsection-edit')[0].trigger('click')
  expect(wrapper.find('.stock-baseline-confirmation').exists()).toBe(false)
  expect(save(wrapper).element.disabled).toBe(true)
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
})

it('取消已确认盘点需要确认丢弃，拒绝留草稿，同意后不写入并清掉勾选', async () => {
  const wrapper = render()
  await enterStockEditor(wrapper)
  await confirmation(wrapper).setValue(true)
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('.manifest-edit-actions button').trigger('click')
  await flushPromises()
  expect(confirmation(wrapper).element.checked).toBe(true)
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  await wrapper.get('.manifest-edit-actions button').trigger('click')
  await flushPromises()
  expect(wrapper.find('.stock-editor').exists()).toBe(false)
  await wrapper.get('.inventory-entry').trigger('click')
  expect(confirmation(wrapper).element.checked).toBe(false)
})

it('失败保留确认与草稿，重复点击只发一笔，重试成功后退出编辑', async () => {
  const attempt = pending()
  inventoryApi.importInventory.mockReturnValueOnce(attempt.promise)
  const wrapper = render()
  await enterStockEditor(wrapper)
  await confirmation(wrapper).setValue(true)
  await save(wrapper).trigger('click')
  await save(wrapper).trigger('click')
  expect(inventoryApi.importInventory).toHaveBeenCalledTimes(1)
  expect(wrapper.get('.stock-count-input').element.disabled).toBe(true)
  attempt.reject(new Error('保存暂时失败'))
  await flushPromises()
  expect(wrapper.get('.stock-edit-error').text()).toContain('保存暂时失败')
  expect(confirmation(wrapper).element.checked).toBe(true)
  expect(save(wrapper).element.disabled).toBe(false)
  expect(save(wrapper).text()).toContain('原样重试盘点')
  expect(wrapper.get('.stock-count-input').element.disabled).toBe(true)
  inventoryApi.getCurrent.mockResolvedValue(fullStock())
  await save(wrapper).trigger('click')
  await flushPromises()
  expect(inventoryApi.importInventory).toHaveBeenCalledTimes(2)
  expect(inventoryApi.importInventory.mock.calls[1][0]).toEqual(inventoryApi.importInventory.mock.calls[0][0])
  expect(wrapper.find('.stock-editor').exists()).toBe(false)
})

it('完整基准下普通数量调整仍可保存，隐藏道具被保留，快照不转换为奖励', async () => {
  inventoryApi.getCurrent.mockResolvedValue(fullStock('acc-a', {
    baijinbi: { count: 100 }, zhuangjinboli: { count: 15 },
  }))
  const wrapper = render()
  await enterStockEditor(wrapper)
  expect(save(wrapper).element.disabled).toBe(true)
  await wrapper.get('input[aria-label="白金币当前库存"]').setValue('120')
  expect(save(wrapper).element.disabled).toBe(false)
  await save(wrapper).trigger('click')
  await flushPromises()
  const record = inventoryApi.importInventory.mock.calls[0][0].records[0]
  expect(record.record_type).toBe('stock_snapshot')
  expect(record.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'baijinbi', count: 120 }),
    expect.objectContaining({ id: 'zhuangjinboli', count: 15 }),
  ]))
})

it('取消结果未确认的盘点重新读取服务端，不写撤销请求，也不把默认零留作基准', async () => {
  inventoryApi.importInventory.mockRejectedValueOnce(new Error('响应中断'))
  const wrapper = render()
  await enterStockEditor(wrapper)
  await confirmation(wrapper).setValue(true)
  await save(wrapper).trigger('click')
  await flushPromises()
  const reads = inventoryApi.getCurrent.mock.calls.length
  inventoryApi.getCurrent.mockResolvedValue(fullStock())
  await wrapper.get('.manifest-edit-actions button').trigger('click')
  await flushPromises()
  expect(inventoryApi.getCurrent).toHaveBeenCalledTimes(reads + 1)
  expect(inventoryApi.importInventory).toHaveBeenCalledTimes(1)
  expect(inventoryApi.deleteRecord).not.toHaveBeenCalled()
  await wrapper.get('.inventory-entry').trigger('click')
  expect(wrapper.find('.stock-baseline-confirmation').exists()).toBe(false)
  expect(save(wrapper).element.disabled).toBe(true)
})

it.each(['失败', '错账号', '无效数量', '空文档'])('库存读取%s时不能把默认零写成盘点', async variant => {
  if (variant === '失败') inventoryApi.getCurrent.mockRejectedValue(new Error('读取失败'))
  else if (variant === '错账号') inventoryApi.getCurrent.mockResolvedValue(fullStock('acc-b'))
  else if (variant === '无效数量') inventoryApi.getCurrent.mockResolvedValue(fullStock('acc-a', { baijinbi: { count: -1 } }))
  else inventoryApi.getCurrent.mockResolvedValue([null])
  const wrapper = render()
  await flushPromises()
  expect(wrapper.find('.inventory-entry').exists()).toBe(false)
  expect(wrapper.get('.inventory-setup[role="alert"]').text()).toContain('读取失败')
  await wrapper.get('.inventory-setup button').trigger('click')
  await flushPromises()
  expect(wrapper.find('.stock-editor').exists()).toBe(false)
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
})

it('没有账号与未登录时禁止盘点，未登录不读取私有库存', async () => {
  inventoryApi.listAccounts.mockResolvedValue([])
  const wrapper = render()
  await flushPromises()
  expect(wrapper.find('.inventory-entry').exists()).toBe(false)
  expect(wrapper.get('.inventory-setup').text()).toContain('创建或选择账号')
  expect(inventoryApi.getCurrent).not.toHaveBeenCalled()
  wrapper.unmount()
  auth.isLoggedIn = false
  const guest = render()
  await flushPromises()
  expect(guest.find('.inventory-entry').exists()).toBe(false)
  expect(guest.get('.inventory-setup').text()).toContain('登录后管理库存')
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  expect(inventoryApi.getCurrent).not.toHaveBeenCalled()
})

it.each(['成功', '失败'])('账号 A 保存迟到%s不得污染 B，B 仍可建立自己的零基准', async outcome => {
  const oldSave = pending()
  inventoryApi.importInventory.mockReturnValueOnce(oldSave.promise)
  const wrapper = render()
  await enterStockEditor(wrapper)
  await confirmation(wrapper).setValue(true)
  await save(wrapper).trigger('click')
  activeAccount.set('acc-b')
  await flushPromises()
  expect(wrapper.find('.stock-editor').exists()).toBe(false)
  await wrapper.get('.inventory-entry').trigger('click')
  await confirmation(wrapper).setValue(true)
  if (outcome === '成功') oldSave.resolve({ accepted: 1 })
  else oldSave.reject(new Error('A 保存失败'))
  await flushPromises()
  expect(confirmation(wrapper).element.checked).toBe(true)
  expect(wrapper.text()).not.toContain('库存已更新')
  expect(wrapper.text()).not.toContain('A 保存失败')
  await save(wrapper).trigger('click')
  await flushPromises()
  expect(inventoryApi.importInventory.mock.calls[1][0].records[0].account_id).toBe('acc-b')
})

it('A→B→A 后旧 A 读取不能覆盖新 A 基准，未加载成功前禁止编辑', async () => {
  const oldRead = pending()
  inventoryApi.getCurrent.mockReturnValueOnce(oldRead.promise)
  const wrapper = render()
  await flushPromises()
  expect(wrapper.get('.inventory-entry').element.disabled).toBe(true)
  activeAccount.set('acc-b')
  await flushPromises()
  inventoryApi.getCurrent.mockResolvedValue(fullStock())
  activeAccount.set('acc-a')
  await flushPromises()
  oldRead.resolve([])
  await flushPromises()
  await wrapper.get('.inventory-entry').trigger('click')
  expect(wrapper.find('.stock-baseline-confirmation').exists()).toBe(false)
  expect(save(wrapper).element.disabled).toBe(true)
})

it('A 的取消确认迟到不得关闭 B 的新草稿', async () => {
  const answer = pending()
  dialog.confirm.mockReturnValueOnce(answer.promise)
  const wrapper = render()
  await enterStockEditor(wrapper)
  await confirmation(wrapper).setValue(true)
  await wrapper.get('.manifest-edit-actions button').trigger('click')
  activeAccount.set('acc-b')
  await flushPromises()
  await wrapper.get('.inventory-entry').trigger('click')
  await confirmation(wrapper).setValue(true)
  answer.resolve(true)
  await flushPromises()
  expect(confirmation(wrapper).element.checked).toBe(true)
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
})

it('退出登录清掉确认，保存迟到不显示成功也不再读库存', async () => {
  const oldSave = pending()
  inventoryApi.importInventory.mockReturnValueOnce(oldSave.promise)
  const wrapper = render()
  await enterStockEditor(wrapper)
  await confirmation(wrapper).setValue(true)
  await save(wrapper).trigger('click')
  const reads = inventoryApi.getCurrent.mock.calls.length
  auth.isLoggedIn = false
  await flushPromises()
  oldSave.resolve({ accepted: 1 })
  await flushPromises()
  expect(wrapper.find('.stock-editor').exists()).toBe(false)
  expect(wrapper.findComponent({ name: 'DataAccountContextBar' }).props('isLoggedIn')).toBe(false)
  expect(wrapper.text()).not.toContain('库存已更新')
  expect(inventoryApi.getCurrent).toHaveBeenCalledTimes(reads)
})

it('卸载后迟到保存不发刷新请求，初始化迟到也不订阅事件', async () => {
  const oldSave = pending()
  inventoryApi.importInventory.mockReturnValueOnce(oldSave.promise)
  const wrapper = render()
  await enterStockEditor(wrapper)
  await confirmation(wrapper).setValue(true)
  await save(wrapper).trigger('click')
  const reads = inventoryApi.getCurrent.mock.calls.length
  wrapper.unmount()
  oldSave.resolve({ accepted: 1 })
  await flushPromises()
  expect(inventoryApi.getCurrent).toHaveBeenCalledTimes(reads)
  const catalog = pending()
  inventoryApi.getCatalog.mockReturnValueOnce(catalog.promise)
  subscribeAccountEvents.mockClear()
  const early = render()
  early.unmount()
  catalog.resolve({ entities: [] })
  await flushPromises()
  expect(subscribeAccountEvents).not.toHaveBeenCalled()
})

it('类型后台刷新保留目录主体，迟到类型数据不覆盖当前库存（替代原源码正则检查）', async () => {
  const wrapper = render()
  await flushPromises()
  const read = pending()
  inventoryApi.getCurrent.mockReturnValueOnce(read.promise)
  await wrapper.get('.manifest-type-switch button[aria-label="切换到密探心纸"]').trigger('click')
  expect(wrapper.find('.backpack').exists()).toBe(true)
  expect(wrapper.find('.stock-editor').exists()).toBe(false)
  await wrapper.get('.manifest-type-switch button[aria-label="切换到背包道具"]').trigger('click')
  await flushPromises()
  read.resolve([{ entity_type: 'agent', entries: { char_001_test: { count: 9 } } }])
  await flushPromises()
  await wrapper.get('.inventory-entry').trigger('click')
  expect(wrapper.findAll('.stock-count-input').every(input => input.element.value === '0')).toBe(true)
})

it('报告无基准入口聚焦日期、进入道具盘点或复用原报告导入工作台，不自动写数据', async () => {
  localStorage.setItem('inventory-tabs', 'acquired')
  const wrapper = render({ attachTo: document.body })
  await flushPromises()
  await wrapper.get('.inventory-setup .link').trigger('click')
  await wrapper.findAll('.inventory-tabs button').find(button => button.text() === '统计报告').trigger('click')
  await flushPromises()
  const focus = vi.spyOn(wrapper.get('#acquired-range-from').element, 'focus')
  await wrapper.findAll('.report-empty-actions button').find(node => node.text() === '调整日期范围').trigger('click')
  expect(focus).toHaveBeenCalled()
  await wrapper.findAll('.report-empty-actions button').find(node => node.text() === '导入库存报告').trigger('click')
  await flushPromises()
  expect(openReport).toHaveBeenCalledTimes(1)
  await wrapper.findAll('.inventory-tabs button').find(node => node.text() === '统计报告').trigger('click')
  await flushPromises()
  await wrapper.findAll('.report-empty-actions button').find(node => node.text() === '盘点道具库存').trigger('click')
  await flushPromises()
  expect(confirmation(wrapper).element.checked).toBe(false)
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('明确校验拒绝保留草稿并允许修改，结果不明则锁定原样重试', async () => {
  inventoryApi.importInventory.mockRejectedValueOnce(Object.assign(new Error('数量校验失败'), { status: 422 }))
  const wrapper = render()
  await enterStockEditor(wrapper)
  await confirmation(wrapper).setValue(true)
  await save(wrapper).trigger('click')
  await flushPromises()
  expect(confirmation(wrapper).element.checked).toBe(true)
  expect(wrapper.get('.stock-count-input').element.disabled).toBe(false)
  await wrapper.get('input[aria-label="白金币当前库存"]').setValue('10')
  inventoryApi.importInventory.mockResolvedValueOnce({ accepted: 0, duplicates: 0 })
  await save(wrapper).trigger('click')
  await flushPromises()
  expect(wrapper.get('.stock-edit-error').text()).toContain('保存结果无法确认')
  expect(wrapper.get('.stock-count-input').element.disabled).toBe(true)
  const request = inventoryApi.importInventory.mock.calls[1][0]
  inventoryApi.getCurrent.mockResolvedValue(fullStock())
  inventoryApi.importInventory.mockResolvedValueOnce({ accepted: 0, duplicates: 1 })
  await save(wrapper).trigger('click')
  await flushPromises()
  expect(inventoryApi.importInventory.mock.calls[2][0]).toEqual(request)
  expect(wrapper.find('.stock-editor').exists()).toBe(false)
})

it('登录用户变化但账号 ID 相同也重新校验归属，旧读取不能建立新身份的基准', async () => {
  const oldRead = pending()
  inventoryApi.getCurrent.mockReturnValueOnce(oldRead.promise)
  const wrapper = render()
  await flushPromises()
  inventoryApi.getCurrent.mockResolvedValue(fullStock())
  auth.userInfo = { id: 'new-user-fixture' }
  await flushPromises()
  expect(inventoryApi.listAccounts).toHaveBeenCalledTimes(2)
  oldRead.resolve([])
  await flushPromises()
  await wrapper.get('.inventory-entry').trigger('click')
  expect(wrapper.find('.stock-baseline-confirmation').exists()).toBe(false)
  expect(save(wrapper).element.disabled).toBe(true)
})

it('清空账号或切换游戏会清掉旧草稿，未选账号不再读取或写入库存', async () => {
  const wrapper = render()
  await enterStockEditor(wrapper)
  await confirmation(wrapper).setValue(true)
  activeAccount.setGame('如鸢', 'acc-a')
  await flushPromises()
  expect(wrapper.find('.stock-editor').exists()).toBe(false)
  await wrapper.get('.inventory-entry').trigger('click')
  expect(confirmation(wrapper).element.checked).toBe(false)
  const reads = inventoryApi.getCurrent.mock.calls.length
  activeAccount.clear()
  await flushPromises()
  expect(wrapper.find('.stock-editor').exists()).toBe(false)
  expect(wrapper.find('.inventory-entry').exists()).toBe(false)
  expect(wrapper.get('.inventory-setup').text()).toContain('请选择游戏账号')
  expect(inventoryApi.getCurrent).toHaveBeenCalledTimes(reads)
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
})

it('旧账号的切页丢弃确认迟到不会关闭新账号草稿或切换其工作区', async () => {
  const answer = pending()
  dialog.confirm.mockReturnValueOnce(answer.promise)
  const wrapper = render()
  await enterStockEditor(wrapper)
  await confirmation(wrapper).setValue(true)
  await wrapper.findAll('.inventory-tabs button').find(node => node.text() === '统计报告').trigger('click')
  activeAccount.set('acc-b')
  await flushPromises()
  await wrapper.get('.inventory-entry').trigger('click')
  await confirmation(wrapper).setValue(true)
  answer.resolve(true)
  await flushPromises()
  expect(confirmation(wrapper).element.checked).toBe(true)
  expect(wrapper.findAll('.inventory-tabs button').find(node => node.text() === '库存清单').attributes('aria-selected')).toBe('true')
})


it('历史页的页头录入入口返回清单，开启编辑但不提交库存', async () => {
  localStorage.setItem('inventory-tabs', 'records')
  const wrapper = render()
  await flushPromises()
  await wrapper.get('.inventory-entry').trigger('click')
  await flushPromises()
  expect(wrapper.get('.inventory-tabs [role="tab"]').attributes('aria-selected')).toBe('true')
  expect(wrapper.find('.stock-editor').exists()).toBe(true)
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
})

it('账号入口复用盘点草稿保护；取消仍编辑A，保存期间禁用切换', async () => {
  const wrapper = render()
  await enterStockEditor(wrapper)
  await confirmation(wrapper).setValue(true)
  dialog.confirm.mockResolvedValueOnce(false)
  const context = wrapper.findComponent({ name: 'DataAccountContextBar' })
  expect(await context.props('beforeSwitch')('acc-b')).toBe(false)
  expect(activeAccount.id).toBe('acc-a'); expect(wrapper.find('.stock-editor').exists()).toBe(true)
  const write = pending(); inventoryApi.importInventory.mockReturnValueOnce(write.promise)
  await save(wrapper).trigger('click')
  expect(context.props('switchDisabled')).toBe(true)
  wrapper.unmount(); write.resolve({ accepted: 1 }); await flushPromises()
})

it('账号A选择文件后的迟到读取不能把报告填入B', async () => {
  const readers = []
  vi.stubGlobal('FileReader', class { constructor() { readers.push(this) } readAsText() {} })
  const wrapper = render(); await flushPromises()
  wrapper.vm.onFilePick({ target: { files: [new File(['A报告'], 'a.json')] } })
  activeAccount.set('acc-b'); await flushPromises()
  readers[0].result = 'A报告'; readers[0].onload()
  expect(wrapper.vm.importText).toBe('')
  expect(wrapper.vm.importError).toBe('')
  expect(inventoryApi.importInventory).not.toHaveBeenCalled()
})

it.each(['success', 'failure'])('库存导出 %s 晚到不会在新账号下载或弹出旧错误', async outcome => {
  const wrapper = render(); await flushPromises()
  const oldExport = pending()
  const alert = vi.spyOn(window, 'alert').mockImplementation(() => {})
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  inventoryApi.exportInventory.mockReturnValueOnce(oldExport.promise)
  const operation = wrapper.vm.doExport()
  expect(inventoryApi.exportInventory).toHaveBeenCalledTimes(1)
  activeAccount.set('acc-b'); await flushPromises()
  if (outcome === 'success') oldExport.resolve({ account_id: 'acc-a' })
  else oldExport.reject(new Error('旧账号导出失败'))
  await operation
  expect(click).not.toHaveBeenCalled(); expect(alert).not.toHaveBeenCalled()
  click.mockRestore(); alert.mockRestore()
})
