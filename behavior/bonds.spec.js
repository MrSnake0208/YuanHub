import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { defineComponent } from 'vue'
import { routeLocationKey } from 'vue-router'
import { useBonds } from '../src/pages/bonds/useBonds.js'
import BondPage from '../src/pages/bonds/index.vue'
import BondExchange from '../src/pages/bonds/BondExchange.vue'
import * as api from '../src/api/bonds.js'
import { listAccounts } from '../src/api/accounts.js'
import { getOperatorCatalog, getOperatorCurrent } from '../src/api/operator.js'
import { activeAccount } from '../src/store/activeAccount.js'
import { auth } from '../src/store/auth.js'
vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ accessToken: 'synthetic', userInfo: { id: 'owner' } }) }))
vi.mock('../src/api/accounts.js', () => ({ listAccounts: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn(), getOperatorCurrent: vi.fn() }))
vi.mock('../src/api/bonds.js', () => ({ getBondCatalog: vi.fn(), getBondArchive: vi.fn(), writeBonds: vi.fn(), exportBonds: vi.fn(), previewBonds: vi.fn(), confirmBonds: vi.fn() }))
const entry = { bond_id: 'bond_fixture', game: '代号鸢', members: ['char_a', 'char_b'], action: 'arson', weather: 'sunny', effect: 'negative', status: 'active' }
const archive = (account_id = 'a', revision = 0) => ({ account_id, game: '代号鸢', revision, catalog_version: 'fixture-v1', records: [], summary: { triggered_count: 0, active_triggered_count: 0, available_total: 1 } })
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b }); return { promise, resolve, reject } }
const wrappers = []
function model() { let result; const wrapper = mount(defineComponent({ setup() { result = useBonds(); return () => null } })); wrappers.push(wrapper); return result }
const button = (w, text) => w.findAll('button').find(b => b.text().includes(text))
beforeEach(() => {
  vi.clearAllMocks(); auth.accessToken = 'synthetic'; auth.userInfo = { id: 'owner' }; activeAccount.set('a')
  listAccounts.mockResolvedValue([{ id: 'a', name: '甲', game: '代号鸢' }, { id: 'b', name: '乙', game: '代号鸢' }])
  api.getBondCatalog.mockResolvedValue({ game: '代号鸢', catalog_version: 'fixture-v1', entries: [entry] })
  api.getBondArchive.mockImplementation(id => Promise.resolve(archive(id)))
  getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'char_a', name: '甲_乙', games: ['代号鸢'] }, { id: 'char_b', name: '丙', games: ['代号鸢'] }] })
  getOperatorCurrent.mockResolvedValue([])
})
afterEach(() => wrappers.splice(0).forEach(w => w.unmount()))
it('匿名及无账号只读目录，账号切换和退出立即清除旧档案', async () => {
  auth.accessToken = ''; auth.userInfo = null
  const m = model(); await flushPromises()
  expect(api.getBondArchive).not.toHaveBeenCalled(); expect(listAccounts).not.toHaveBeenCalled(); expect(m.summary.value).toBeNull()
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'owner' }; await flushPromises()
  expect(m.state.archive.account_id).toBe('a')
  activeAccount.set('b'); expect(m.state.archive).toBeNull(); await flushPromises(); expect(m.state.archive.account_id).toBe('b')
  auth.accessToken = ''; expect(m.state.archive).toBeNull(); expect(m.records.value).toEqual([])
})
it('迟到读取和保存不能覆盖新账号，旧用户账号列表不会回灌', async () => {
  const late = deferred(); api.getBondArchive.mockImplementation(id => id === 'a' ? late.promise : Promise.resolve(archive(id, 7)))
  const m = model(); await flushPromises(); activeAccount.set('b'); await flushPromises()
  late.resolve(archive('a', 99)); await flushPromises(); expect(m.state.archive.account_id).toBe('b'); expect(m.state.archive.revision).toBe(7)
  const write = deferred(); api.writeBonds.mockReturnValueOnce(write.promise)
  const saving = m.save([{ bond_id: entry.bond_id, triggered: true }]); activeAccount.set('a'); await flushPromises()
  write.resolve(archive('b', 8)); await saving; expect(m.state.archive.account_id).toBe('a')
  const oldAccounts = deferred(); listAccounts.mockReturnValueOnce(oldAccounts.promise); const loading = m.loadAccounts()
  listAccounts.mockResolvedValue([]); auth.userInfo = { id: 'new-owner' }; await flushPromises()
  oldAccounts.resolve([{ id: 'private-old', game: '代号鸢' }]); await loading; expect(m.state.accounts).toEqual([])
})
it('读取失败不显示零，保存失败不伪造已记录，冲突重新读取', async () => {
  api.getBondArchive.mockRejectedValueOnce(new Error('档案故障'))
  const m = model(); await flushPromises()
  // Initial account resolution may initiate more than one read; explicitly exercise the failure boundary.
  api.getBondArchive.mockRejectedValueOnce(new Error('档案故障')); await m.refresh()
  expect(m.summary.value).toBeNull(); expect(m.state.error).toContain('档案故障'); expect(m.writable.value).toBe(false)
  await m.refresh(); api.writeBonds.mockRejectedValueOnce(new Error('网络故障'))
  expect(await m.save([{ bond_id: entry.bond_id, triggered: true }])).toBe(false)
  expect(m.recorded(entry.bond_id)).toBe(false); expect(m.state.notice).toBe('')
  await m.refresh(); api.writeBonds.mockRejectedValueOnce(Object.assign(new Error('冲突'), { status: 409 })); api.getBondArchive.mockResolvedValue(archive('a', 9))
  await m.save([{ bond_id: entry.bond_id, triggered: true }]); expect(m.state.archive.revision).toBe(9); expect(m.state.error).toContain('冲突')
})
it('筛选不影响服务端累计，未填写拥有资料默认显示全部', async () => {
  api.getBondArchive.mockResolvedValue({ ...archive(), summary: { triggered_count: 20, available_total: 1, active_triggered_count: 0 } })
  const m = model(); await flushPromises(); m.filters.onlyOwned = true
  expect(m.filtered.value).toHaveLength(1); m.filters.query = '不存在'; expect(m.filtered.value).toHaveLength(0); expect(m.summary.value.triggered_count).toBe(20)
})
it('真实页面显示负面效果和失败状态，记录后才显示已记录', async () => {
  const w = mount(BondPage, { global: { provide: { [routeLocationKey]: { fullPath: '/bonds' } }, stubs: { IslandSidebar: true, SiteFooter: true, CompactToolHeader: true, DataAccountContextBar: true, RouterLink: RouterLinkStub } } }); wrappers.push(w)
  await flushPromises(); expect(w.text()).toContain('貌合神离')
  const next = { ...archive('a', 1), records: [{ bond_id: entry.bond_id, triggered: true }], summary: { triggered_count: 1, available_total: 1, active_triggered_count: 1 } }
  const saving = deferred(); api.writeBonds.mockReturnValueOnce(saving.promise)
  await button(w, '记录触发').trigger('click'); expect(w.text()).not.toContain('已记录 · 取消')
  expect(button(w, '备份迁移').element.disabled).toBe(true)
  saving.resolve(next); await flushPromises(); expect(w.text()).toContain('已记录 · 取消'); expect(w.text()).toContain('已保存到当前账号')
})
it('旧文件显式选择来源和缺失游戏，切目标后预览失效且迟到确认不串号', async () => {
  const w = mount(BondExchange, { props: { identity: 'owner', accountId: 'a', accountName: '甲', game: '代号鸢', revision: 0, catalogVersion: 'fixture-v1', generation: 1, accounts: [{ id: 'a', name: '甲', game: '代号鸢' }, { id: 'b', name: '乙', game: '代号鸢' }], canUse: true } }); wrappers.push(w)
  const file = w.find('input[type=file]')
  Object.defineProperty(file.element, 'files', { configurable: true, value: [{ name: 'synthetic.json', size: 50, text: async () => JSON.stringify({ '旧账号': { '丙_甲_乙_纵火_晴天': true } }) }] })
  await file.trigger('change'); await flushPromises(); expect(button(w, '生成导入预览').element.disabled).toBe(true)
  const selects = w.findAll('select'); await selects[0].setValue('旧账号'); await selects[1].setValue('代号鸢')
  api.previewBonds.mockResolvedValue({ account_id: 'a', game: '代号鸢', expected_revision: 0, catalog_version: 'fixture-v1', strategy: 'merge', preview_token: 'synthetic', stats: { add: 1, same: 0, conflict: 0, unknown: 0, mismatched: 0, invalid: 0 }, items: [], affected: 1 })
  await button(w, '生成导入预览').trigger('click'); await flushPromises(); expect(api.previewBonds).toHaveBeenCalledWith('owner', expect.objectContaining({ source_account: '旧账号', source_game: '代号鸢', account_id: 'a' }))
  const pending = deferred(); api.confirmBonds.mockReturnValue(pending.promise); await button(w, '确认导入 1 条修改').trigger('click')
  await w.setProps({ accountId: 'b', generation: 2 }); pending.resolve(archive('a', 1)); await flushPromises()
  expect(w.emitted('committed')).toBeUndefined(); expect(w.text()).not.toContain('确认导入到')
})
