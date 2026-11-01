import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import BondAdmin from '../src/pages/bonds/admin.vue'
import { auth } from '../src/store/auth.js'
import { getBondAdminCatalog, bondAdminAction } from '../src/api/bonds.js'
import { getOperatorCatalog } from '../src/api/operator.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ accessToken: 'synthetic', userInfo: { id: 'owner' }, adminAccess: { permissions: ['bond_catalog:write'] } }) }))
vi.mock('../src/api/bonds.js', () => ({ getBondAdminCatalog: vi.fn(), bondAdminAction: vi.fn() }))
vi.mock('../src/api/operator.js', () => ({ getOperatorCatalog: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
vi.mock('../src/utils/useUnsavedChanges.js', () => ({ useUnsavedChanges: () => async () => true }))

const row = { bond_id: 'bond_stable', game: '代号鸢', members: ['char_a', 'char_b'], action: 'arson', weather: 'sunny', effect: 'positive', status: 'active' }
const catalog = (revision = 2, draft = [row]) => ({ game: '代号鸢', revision, published: { catalog_version: 'v1', entries: [row] }, draft: structuredClone(draft), history: [] })
let wrapper
const button = text => wrapper.findAll('button').find(item => item.text().includes(text))
async function open() {
  wrapper = mount(BondAdmin, { global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: RouterLinkStub } } })
  await flushPromises()
}
async function read(document) {
  const input = wrapper.find('input[type=file]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [{ name: 'catalog.json', size: 100, text: async () => JSON.stringify(document) }] })
  await input.trigger('change'); await flushPromises()
}
beforeEach(() => {
  vi.clearAllMocks(); auth.accessToken = 'synthetic'; auth.userInfo = { id: 'owner' }; auth.adminAccess = { permissions: ['bond_catalog:write'] }
  getBondAdminCatalog.mockResolvedValue(catalog())
  getOperatorCatalog.mockResolvedValue({ operators: [{ id: 'char_a', name: '甲', games: ['代号鸢'] }, { id: 'char_b', name: '乙', games: ['代号鸢'] }] })
  dialog.confirm.mockResolvedValue(true)
})
afterEach(() => wrapper?.unmount())
it('没有权限不读取目录或发起管理写入', async () => {
  auth.adminAccess = { permissions: [] }; await open()
  expect(wrapper.text()).toContain('需要羁绊目录管理权限'); expect(getBondAdminCatalog).not.toHaveBeenCalled(); expect(bondAdminAction).not.toHaveBeenCalled()
})
it('转换预览隔离待处理条目，显式保存和发布保持稳定ID', async () => {
  await open()
  await read({ format: 'yuanhub-bond-conversion', schema_version: 1, catalogs: [{ game: '代号鸢', entries: [{ ...row, effect: 'negative' }] }], pending: [{ entry: { ...row, bond_id: 'pending' } }] })
  expect(wrapper.text()).toContain('1 条因游戏可用性冲突'); expect(bondAdminAction).not.toHaveBeenCalled()
  await button('将预览合并').trigger('click')
  bondAdminAction.mockResolvedValueOnce(catalog(3, [{ ...row, effect: 'negative' }]))
  await button('保存草稿').trigger('click'); await flushPromises()
  expect(bondAdminAction).toHaveBeenLastCalledWith('代号鸢', 'owner', 'draft', { expected_revision: 2, entries: [{ ...row, effect: 'negative' }] })
  bondAdminAction.mockResolvedValueOnce({ expected_revision: 3, changes: [{ ...row, effect: 'negative' }], errors: [] })
  await button('预览发布').trigger('click'); await flushPromises()
  expect(bondAdminAction.mock.calls.some(call => call[2] === 'publish')).toBe(false)
  bondAdminAction.mockResolvedValueOnce(catalog(4))
  await button('确认发布此预览').trigger('click'); await flushPromises()
  expect(bondAdminAction).toHaveBeenLastCalledWith('代号鸢', 'owner', 'publish', { expected_revision: 3, restore_version: null })
  expect(wrapper.text()).toContain('公共目录已发布')
})
it('身份冲突整份本地文件不合并，保存版本冲突保留编辑', async () => {
  await open()
  await read({ format: 'yuanhub-bond-catalog', schema_version: 1, game: '代号鸢', entries: [{ ...row, bond_id: 'other' }] })
  await button('将预览合并').trigger('click'); expect(wrapper.text()).toContain('文件稳定ID与身份冲突')
  expect(button('保存草稿').element.disabled).toBe(true)
  await wrapper.find('fieldset select').setValue('negative')
  bondAdminAction.mockRejectedValueOnce(Object.assign(new Error('stale'), { status: 409 }))
  await button('保存草稿').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('编辑已保留'); expect(wrapper.find('fieldset select').element.value).toBe('negative')
  expect(button('预览发布').element.disabled).toBe(true)
})
it('发布确认期间身份改变不能以新身份提交旧目录', async () => {
  await open(); bondAdminAction.mockResolvedValueOnce({ expected_revision: 2, changes: [], errors: [] })
  await button('预览发布').trigger('click'); await flushPromises()
  let resolve; dialog.confirm.mockReturnValueOnce(new Promise(r => { resolve = r }))
  await button('确认发布此预览').trigger('click')
  auth.userInfo = { id: 'new-owner' }; await flushPromises(); resolve(true); await flushPromises()
  expect(bondAdminAction.mock.calls.some(call => call[2] === 'publish')).toBe(false)
})
