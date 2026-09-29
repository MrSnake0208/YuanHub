import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import InventoryPage from '../src/pages/inventory/index.vue'
import * as inventoryApi from '../src/api/inventory.js'
import { getOperatorCatalog } from '../src/api/operator.js'
import { dialog } from '../src/utils/dialog.js'
import { activeAccount } from '../src/store/activeAccount.js'

vi.mock('../src/store/auth.js', () => ({ auth: { isLoggedIn: true } }))
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

function render() {
  return mount(InventoryPage, { global: {
    stubs: {
      RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true,
      AccountWorkspace: true, DataAccountContextBar: true, ArchiveExchangePanel: true,
      ResourceBalanceReport: true, AcquiredPeriodReport: true, RewardEntryWorkspace: true,
    },
    directives: { reveal: () => {} },
  } })
}

beforeEach(() => {
  vi.clearAllMocks()
  window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
  localStorage.setItem('inventory-tabs', 'records')
  activeAccount.set('acc-1')
  inventoryApi.getCatalog.mockResolvedValue({ entities: [] })
  getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'char_001_test', name: '测试密探', rarity: 5, games: ['代号鸢'] }] })
  inventoryApi.getCurrent.mockResolvedValue([])
  inventoryApi.listAccounts.mockResolvedValue([{ id: 'acc-1', name: '大号', game: '代号鸢' }])
  inventoryApi.listAgentFavorites.mockResolvedValue([])
  inventoryApi.listRecords.mockResolvedValue({ items: [record], next_cursor: 'next' })
  inventoryApi.deleteRecord.mockResolvedValue(true)
  inventoryApi.restoreRecord.mockResolvedValue(true)
  dialog.confirm.mockResolvedValue(true)
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
  expect(wrapper.text()).toContain('手动更新库存、添加奖励流水或导入本地报告')
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
  await wrapper.get('.scope-edit-agent').trigger('click')
  expect(names('.stock-edit-slot')).toEqual(defaultOrder)
  expect(wrapper.get('.agent-sort-control summary').text()).toContain('实装顺序')
  await wrapper.get('.manifest-edit-actions button').trigger('click')

  await wrapper.findAll('.agent-group-control .agent-menu-options button')
    .find(node => node.text().includes('按属性')).trigger('click')
  const groupedOrder = names('.agent-card')
  expect(groupedOrder).toEqual(['阳密探', '阴密探', '火密探'])
  await wrapper.get('.scope-edit-agent').trigger('click')
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
