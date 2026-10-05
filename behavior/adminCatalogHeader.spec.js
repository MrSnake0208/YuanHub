import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import OperatorAdmin from '../src/pages/operator/admin.vue'
import LevelAdmin from '../src/pages/level/admin.vue'
import { listAdminOperatorCatalog } from '../src/api/operator.js'
import { listAdminLevelCatalog, updateAdminLevel, previewAdminLevelImport, commitAdminLevelImport } from '../src/api/level.js'

const router = vi.hoisted(() => ({ replace: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => router }))
vi.mock('../src/store/auth.js', () => ({ auth: { isLoggedIn: true } }))
vi.mock('../src/api/operator.js', () => ({
  listAdminOperatorCatalog: vi.fn(), createAdminOperatorCatalog: vi.fn(), updateAdminOperatorCatalog: vi.fn(),
  deleteAdminOperatorCatalog: vi.fn(), uploadAdminOperatorAvatar: vi.fn(), deleteAdminOperatorAvatar: vi.fn()
}))
vi.mock('../src/api/level.js', async importOriginal => ({
  ...await importOriginal(), listAdminLevelCatalog: vi.fn(), updateAdminLevel: vi.fn(),
  previewAdminLevelImport: vi.fn(), commitAdminLevelImport: vi.fn()
}))
const render = Component => mount(Component, { global: {
  stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: true }, directives: { reveal: {} }
} })
beforeEach(() => {
  vi.clearAllMocks()
  listAdminOperatorCatalog.mockResolvedValue([{ id: 'char_001_demo', name: '测试密探', games: ['如鸢'], special_oddity_name: '增伤值', catalog_version: 'v3' }])
  listAdminLevelCatalog.mockResolvedValue({ catalogVersion: '目录-v3', levels: [
    { id: 'level-a', name: '测试关卡', game: '如鸢', catOne: '地宫', revision: 3 },
    { id: 'level-b', name: '另一个关卡', game: '代号鸢', catOne: '主线', revision: 2 }
  ] })
})

it('密探身份独立，摘要和新增跟随目录，搜索不改变总量与对象版本', async () => {
  const wrapper = render(OperatorAdmin); await flushPromises()
  expect(wrapper.get('h1').text()).toBe('公共密探图鉴')
  expect(wrapper.get('.page-header-back').attributes('to')).toBe('/manage')
  expect(wrapper.find('main > header button').exists()).toBe(false)
  expect(wrapper.get('.catalog-summary').text()).toContain('共 1 位')
  expect(wrapper.get('.cell-ver').text()).toContain('v3')
  await wrapper.get('input[type="search"]').setValue('没有这个密探')
  expect(wrapper.get('.result-count').text()).toBe('0 位密探')
  expect(wrapper.get('.catalog-summary').text()).toContain('共 1 位')
  await wrapper.get('.admin-bar button').trigger('click')
  expect(wrapper.get('[role="dialog"]').text()).toContain('新增密探')
})

it('关卡版本归列表，原游戏筛选保留实际目录数量', async () => {
  const wrapper = render(LevelAdmin); await flushPromises()
  expect(wrapper.get('h1').text()).toBe('关卡管理')
  expect(wrapper.find('main > header button').exists()).toBe(false)
  expect(wrapper.get('.list-summary').text()).toContain('显示 2 / 2 条')
  expect(wrapper.get('.catalog-version').text()).toContain('目录-v3')
  await wrapper.get('select[aria-label="按游戏筛选"]').setValue('如鸢')
  expect(wrapper.get('.list-summary').text()).toContain('显示 1 / 2 条')
  expect(wrapper.findAll('.level-mobile-card')).toHaveLength(1)
  expect(wrapper.get('.level-mobile-card').text()).toContain('修订 3')
})

it.each([OperatorAdmin, LevelAdmin])('读取中与错误保留页头、恢复和原403边界', async Component => {
  const api = Component === OperatorAdmin ? listAdminOperatorCatalog : listAdminLevelCatalog
  let reject
  api.mockReturnValue(new Promise((_, fail) => { reject = fail }))
  const wrapper = render(Component)
  expect(wrapper.get('[role="status"]').text()).toContain('正在加载')
  expect(wrapper.find('.catalog-summary,.list-summary').exists()).toBe(false)
  reject(new Error('合成读取失败')); await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toContain('合成读取失败')
  api.mockRejectedValue(Object.assign(new Error('权限不足'), { status: 403 }))
  await wrapper.get('.state-retry').trigger('click'); await flushPromises()
  expect(router.replace).toHaveBeenCalledWith({ path: '/forbidden', query: { from: Component === OperatorAdmin ? '/operator/admin' : '/level/admin' } })
})

it('关卡导入错误就地显示，revision冲突仍保留编辑与重载入口', async () => {
  const wrapper = render(LevelAdmin); await flushPromises()
  await wrapper.get('.import-panel textarea').setValue('非法 JSON')
  await wrapper.get('.import-actions button').trigger('click'); await flushPromises()
  expect(wrapper.get('.inline-error').text()).toContain('不是有效 JSON')
  expect(previewAdminLevelImport).not.toHaveBeenCalled()
  expect(commitAdminLevelImport).not.toHaveBeenCalled()
  await wrapper.get('.level-table .table-action').trigger('click')
  updateAdminLevel.mockRejectedValue(Object.assign(new Error('revision'), { status: 409 }))
  document.querySelector('.editor-actions .primary').click(); await flushPromises()
  expect(document.querySelector('.editor-error').textContent).toContain('请重新加载最新数据')
  expect(document.querySelector('.editor-error button').textContent).toBe('重新加载')
  expect(document.querySelector('.revision-note').textContent).toContain('3')
})
