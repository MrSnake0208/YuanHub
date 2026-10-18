import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { createMemoryHistory, createRouter, RouterView } from 'vue-router'
import Page from '../src/pages/achievement/admin.vue'
import { auth } from '../src/store/auth.js'
import * as api from '../src/api/achievementCatalogAdmin.js'
import { getVisibleAdminTools } from '../src/utils/adminTools.js'
import { requiresBetaApi } from '../src/utils/betaAccess.js'
import { isRouteAccessAllowed } from '../src/utils/routeAccess.js'
import { routes } from '../src/router/routes.js'

vi.mock('../src/store/auth.js', async () => ({ auth: (await import('vue')).reactive({ userInfo: { id: 'admin' }, adminAccess: { permissions: ['achievement_catalog:write'] } }) }))
vi.mock('../src/api/achievementCatalogAdmin.js', () => ({ getAchievementCatalogAdmin: vi.fn(), achievementCatalogCommand: vi.fn(), exportAchievementCatalog: vi.fn() }))
const clone = v => JSON.parse(JSON.stringify(v))
function content(game = '代号鸢') {
  return { game, data_status: 'partial', coverage: '测试范围', categories: [{ category_id: 'cat_fixture', name: '分类', sort: 0, enabled: true }], retired_ids: [], catalog_version: '', entries: [{ achievement_id: 'yh_test_1', game, category_id: 'cat_fixture', name: '测试成就', condition: '条件', sort: 0, is_hidden: null, aliases: [], operators: [], chapter: null, reward: '无奖励', method: null, spoiler: null, sources: [], verified_at: '', data_status: 'unverified', progress_kind: null, target: null, unit: null }] }
}
function state(game = '代号鸢') {
  const draft = content(game)
  return { revision: 3, draft, published: { version: 'v1', content: { ...clone(draft), entries: [], data_status: 'empty' }, published_at: '2026-10-18', published_by: 'admin' }, history: [] }
}
const button = (w, label) => w.findAll('button').find(b => b.text() === label)
let wrappers = []
async function page() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: Page }, { path: '/away', component: { template: '<p>其他页面</p>' } }] })
  await router.push('/'); await router.isReady()
  const w = mount(RouterView, { global: { plugins: [router], stubs: { IslandSidebar: true, RouterLink: RouterLinkStub } } })
  wrappers.push(w); await flushPromises(); return w
}
beforeEach(() => {
  vi.clearAllMocks()
  auth.userInfo = { id: 'admin' }; auth.adminAccess = { permissions: ['achievement_catalog:write'] }
  api.getAchievementCatalogAdmin.mockImplementation(game => Promise.resolve(state(game)))
})
afterEach(() => { wrappers.forEach(w => { const element = w.element; w.unmount(); element.remove() }); wrappers = []; vi.unstubAllGlobals() })

it('普通用户不读取后台，入口由权限控制且不依赖玩家内测开关', async () => {
  auth.adminAccess = { permissions: [] }
  const w = await page()
  expect(w.text()).toContain('需要成就目录管理权限')
  expect(api.getAchievementCatalogAdmin).not.toHaveBeenCalled()
  expect(getVisibleAdminTools(auth.adminAccess).some(t => t.key === 'achievement-catalog')).toBe(false)
  expect(getVisibleAdminTools({ permissions: ['achievement_catalog:write'] }).some(t => t.key === 'achievement-catalog')).toBe(true)
  const route = routes.find(r => r.path === '/achievement/admin')
  expect(isRouteAccessAllowed(route.meta, auth.adminAccess)).toBe(false)
  expect(isRouteAccessAllowed(route.meta, { permissions: ['achievement_catalog:write'] })).toBe(true)
  expect(route.meta.feature).toBeUndefined()
  expect(requiresBetaApi('POST', '/v1/admin/achievement-catalogs/publish')).toBe(false)
})

it('修改只保存草稿，失败保留输入且未保存时禁止发布和切游戏丢失', async () => {
  const w = await page()
  await w.get('.entry-row').trigger('click')
  const input = w.get('.entry-editor input[maxlength="200"]')
  await input.setValue('更名')
  expect(button(w, '预览发布').attributes('disabled')).toBeDefined()
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  await button(w, '如鸢').trigger('click')
  expect(api.getAchievementCatalogAdmin).toHaveBeenCalledTimes(1)
  api.achievementCatalogCommand.mockRejectedValueOnce(Object.assign(new Error('目录版本冲突'), { status: 409 }))
  await button(w, '保存草稿').trigger('click'); await flushPromises()
  expect(input.element.value).toBe('更名')
  expect(w.text()).toContain('目录版本冲突')
  expect(api.achievementCatalogCommand.mock.calls[0][2]).toBe('draft')
  expect(api.achievementCatalogCommand.mock.calls[0][4].catalog.entries[0].name).toBe('更名')
  expect(api.achievementCatalogCommand.mock.calls.some(c => c[2] === 'publish')).toBe(false)
})

it('发布预览有错误时禁止确认，干净预览需要另一次确认发布', async () => {
  const w = await page()
  api.achievementCatalogCommand.mockResolvedValueOnce({ expected_revision: 3, changes: [], category_changes: [], errors: ['成就名称必填'], progress_changes: [], restored_from: null })
  await button(w, '预览发布').trigger('click'); await flushPromises()
  expect(w.text()).toContain('成就名称必填')
  expect(button(w, '确认发布').attributes('disabled')).toBeDefined()
  api.achievementCatalogCommand.mockResolvedValueOnce({ expected_revision: 3, changes: [{ achievement_id: 'yh_test_1', name: '测试成就', kind: 'add' }], category_changes: [], errors: [], progress_changes: [], restored_from: null })
  await button(w, '预览发布').trigger('click'); await flushPromises()
  expect(api.achievementCatalogCommand.mock.calls.some(c => c[2] === 'publish')).toBe(false)
  api.achievementCatalogCommand.mockResolvedValueOnce({ ...state(), revision: 4 })
  await button(w, '确认发布').trigger('click'); await flushPromises()
  expect(api.achievementCatalogCommand).toHaveBeenLastCalledWith('代号鸢', 'admin', 'publish', 3, {})
  expect(w.text()).toContain('目录已发布')
})

it('发布错误按名称合并且可定位编辑，不丢失未知错误', async () => {
  const initial = state(); initial.draft.data_status = 'empty'; initial.draft.coverage = '暂无已核验资料'
  api.getAchievementCatalogAdmin.mockResolvedValueOnce(initial)
  const w = await page()
  api.achievementCatalogCommand.mockResolvedValueOnce({ expected_revision: 3, changes: [], category_changes: [], errors: ['yh_test_1：进度类型非法', 'yh_test_1：目标必须为正数', 'yh_unknown：其他错误'], progress_changes: [], restored_from: null })
  await button(w, '预览发布').trigger('click'); await flushPromises()
  const problems = w.get('.publication .error')
  expect(problems.text()).toContain('进度类型非法；目标必须为正数')
  expect(problems.text()).toContain('yh_unknown：其他错误')
  expect(problems.text()).not.toContain('yh_test_1：')
  expect(problems.findAll('button').filter(b => b.text() === '编辑「测试成就」')).toHaveLength(1)
  expect(button(w, '确认发布').attributes('disabled')).toBeDefined()
  await button(w, '编辑「测试成就」').trigger('click')
  expect(w.get('.entry-editor input[maxlength="200"]').element.value).toBe('测试成就')
  expect(api.achievementCatalogCommand.mock.calls.map(c => c[2])).toEqual(['preview'])
})

it('已有未核验草稿可直接预览确认发布，不显示来源或核验表单', async () => {
  const initial = state(); initial.draft.data_status = 'empty'; initial.draft.coverage = '暂无已核验资料'
  initial.draft.entries[0].condition = ''; initial.draft.entries[0].reward = null
  api.getAchievementCatalogAdmin.mockResolvedValueOnce(initial)
  const w = await page(); await w.get('.entry-row').trigger('click')
  expect(w.find('.coverage').attributes('open')).toBeUndefined()
  expect(w.text()).not.toContain('资料来源')
  expect(w.find('input[type="url"]').exists()).toBe(false)
  expect(w.text()).not.toContain('核验日期'); expect(w.text()).not.toContain('核验状态')
  expect(w.find('input[type="date"]').exists()).toBe(false)
  api.achievementCatalogCommand.mockResolvedValueOnce({ expected_revision: 3, changes: [{ achievement_id: 'yh_test_1', name: '测试成就', kind: 'add' }], category_changes: [], errors: [], progress_changes: [], restored_from: null })
  await button(w, '预览发布').trigger('click'); await flushPromises()
  expect(w.get('.publication').text()).toContain('范围：部分收录')
  expect(button(w, '确认发布').attributes('disabled')).toBeUndefined()
  api.achievementCatalogCommand.mockResolvedValueOnce({ ...initial, revision: 4 })
  await button(w, '确认发布').trigger('click'); await flushPromises()
  expect(api.achievementCatalogCommand.mock.calls.map(c => c[2])).toEqual(['preview', 'publish'])
  expect(api.achievementCatalogCommand.mock.lastCall[4]).toEqual({})
  expect(initial.draft.entries[0].data_status).toBe('unverified')
  expect(initial.draft.entries[0].verified_at).toBe('')
})

it('回滚错误使用历史名称且不提供编辑当前草稿的跳转', async () => {
  const initial = state(), old = content(); old.entries[0].name = '历史名称'
  initial.history = [{ version: 'v0', content: old }]
  api.getAchievementCatalogAdmin.mockResolvedValueOnce(initial)
  const w = await page()
  await w.findAll('select').find(s => s.text().includes('选择历史版本')).setValue('v0')
  api.achievementCatalogCommand.mockResolvedValueOnce({ expected_revision: 3, changes: [], category_changes: [], errors: ['yh_test_1：进度口径不兼容'], progress_changes: [], restored_from: 'v0' })
  await button(w, '对比并预览回滚').trigger('click'); await flushPromises()
  const problems = w.get('.publication .error')
  expect(problems.text()).toContain('历史名称：')
  expect(problems.text()).not.toContain('测试成就')
  expect(problems.find('button').exists()).toBe(false)
  expect(button(w, '确认回滚并发布新版本').attributes('disabled')).toBeDefined()
})

it('退出或切换登录身份丢弃旧请求结果，不把旧管理员草稿显示给新用户', async () => {
  let resolve
  api.getAchievementCatalogAdmin.mockReturnValueOnce(new Promise(r => { resolve = r }))
  const w = await page()
  auth.userInfo = null; await flushPromises()
  resolve(state()); await flushPromises()
  expect(w.find('.entry-row').exists()).toBe(false)
  expect(w.text()).not.toContain('测试成就')
})

it('切换进度为不支持会清空目标和单位，保留历史来源且不自动核验', async () => {
  const initial = state(); initial.draft.entries[0].progress_kind = 'integer'; initial.draft.entries[0].target = 10; initial.draft.entries[0].unit = '次'
  initial.draft.entries[0].sources = [{ title: '历史资料来源', url: 'https://example.test/legacy', usage: '测试资料' }]
  api.getAchievementCatalogAdmin.mockResolvedValueOnce(initial)
  const w = await page(); await w.get('.entry-row').trigger('click')
  const kind = w.findAll('select').find(s => s.text().includes('不支持数值进度'))
  await kind.setValue('')
  api.achievementCatalogCommand.mockImplementation((g, u, action, revision, fields) => Promise.resolve({ ...initial, revision: 4, draft: fields.catalog }))
  await button(w, '保存草稿').trigger('click'); await flushPromises()
  const e = api.achievementCatalogCommand.mock.calls[0][4].catalog.entries[0]
  expect(e.progress_kind).toBeNull(); expect(e.target).toBeNull(); expect(e.unit).toBeNull()
  expect(e.sources).toEqual(initial.draft.entries[0].sources)
  expect(w.text()).not.toContain('历史资料来源')
  expect(e.data_status).toBe('unverified'); expect(e.verified_at).toBe('')
})

it('导入先预览，非法项禁用确认；策略变化必须重做预览，确认只写草稿', async () => {
  const w = await page()
  const document = content()
  const input = w.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: [{ name: 'catalog.json', size: 200, text: async () => JSON.stringify(document) }] })
  await input.trigger('change'); await flushPromises()
  const plan = { expected_revision: 3, strategy: 'keep', preview_token: 'test-preview', items: [{ outcome: 'invalid', message: '非法条目' }] }
  api.achievementCatalogCommand.mockResolvedValueOnce(plan)
  await button(w, '预览导入').trigger('click'); await flushPromises()
  expect(button(w, '确认导入草稿').attributes('disabled')).toBeDefined()
  const strategy = w.findAll('select').find(s => s.text().includes('明确更新冲突条目'))
  await strategy.setValue('update')
  expect(button(w, '确认导入草稿')).toBeUndefined()
  api.achievementCatalogCommand.mockResolvedValueOnce({ ...plan, strategy: 'update', items: [{ outcome: 'conflict', message: '更新并重新核验' }] })
  await button(w, '预览导入').trigger('click'); await flushPromises()
  api.achievementCatalogCommand.mockResolvedValueOnce({ ...state(), revision: 4 })
  await button(w, '确认导入草稿').trigger('click'); await flushPromises()
  expect(api.achievementCatalogCommand).toHaveBeenLastCalledWith('代号鸢', 'admin', 'import-confirm', 3, { document, strategy: 'update', preview_token: 'test-preview' })
  expect(api.achievementCatalogCommand.mock.calls.some(c => c[2] === 'publish')).toBe(false)
})

it('无别名、方法或章节表单和别名搜索，保存其他字段保留历史内容', async () => {
  const initial = state(); initial.draft.entries[0].progress_kind = 'integer'; initial.draft.entries[0].target = 10
  Object.assign(initial.draft.entries[0], { aliases: ['历史别名'], method: '历史完成方法', chapter: '历史章节' })
  api.getAchievementCatalogAdmin.mockResolvedValueOnce(initial)
  const w = await page()
  const search = w.get('input[type="search"]')
  await search.setValue('历史别名')
  expect(w.find('.entry-row').exists()).toBe(false)
  await search.setValue('测试成就'); await w.get('.entry-row').trigger('click')
  const editorText = w.get('.entry-editor').text()
  for (const label of ['别名', '完成方法', '章节']) expect(editorText).not.toContain(label)
  const target = w.get('.entry-editor input[min="0.000000001"]')
  await target.setValue('10'); await target.setValue('')
  api.achievementCatalogCommand.mockImplementation((g, u, a, r, fields) => Promise.resolve({ ...initial, revision: 4, draft: fields.catalog }))
  await button(w, '保存草稿').trigger('click'); await flushPromises()
  const e = api.achievementCatalogCommand.mock.calls[0][4].catalog.entries[0]
  expect(e.aliases).toEqual(['历史别名']); expect(e.method).toBe('历史完成方法'); expect(e.chapter).toBe('历史章节')
  expect(e.target).toBeNull()
})

it('未保存编辑离开时可取消，版本冲突后可导出本地内容再恢复', async () => {
  const w = await page(); await w.get('.entry-row').trigger('click')
  await w.get('.entry-editor input[maxlength="200"]').setValue('本地待保存名称')
  vi.spyOn(window, 'confirm').mockReturnValue(false)
  await w.vm.$router.push('/away'); await flushPromises()
  expect(w.text()).toContain('成就目录管理')
  let exported
  const OriginalBlob = globalThis.Blob, OriginalURL = globalThis.URL
  vi.stubGlobal('Blob', class extends OriginalBlob { constructor(parts, options) { super(parts, options); exported = JSON.parse(parts[0]) } })
  vi.stubGlobal('URL', class extends OriginalURL { static createObjectURL() { return 'blob:synthetic' } static revokeObjectURL() {} })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  await button(w, '导出本地未保存草稿').trigger('click'); await flushPromises()
  expect(exported.catalog.entries[0].name).toBe('本地待保存名称')
  expect(exported.format).toBe('yuanhub-achievement-catalog')
  expect(api.exportAchievementCatalog).not.toHaveBeenCalled()
  expect(w.text()).toContain('已导出本地未保存草稿')
})

it('刷新或历史恢复移除当前选中条目时回到列表，手机不会停留在空编辑视图', async () => {
  const w = await page(); await w.get('.entry-row').trigger('click')
  expect(w.get('.catalog-workspace').classes()).toContain('editing')
  const latest = state(); latest.revision = 4; latest.draft.entries = []
  api.getAchievementCatalogAdmin.mockResolvedValueOnce(latest)
  await button(w, '重新读取').trigger('click'); await flushPromises()
  expect(w.get('.catalog-workspace').classes()).not.toContain('editing')
  expect(w.find('.entry-editor').exists()).toBe(false)
  expect(w.find('.entry-list').exists()).toBe(true)
})
