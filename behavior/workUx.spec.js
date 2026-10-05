import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import WorkDetail from '../src/pages/work/detail.vue'
import WorkEditor from '../src/pages/work/editor.vue'
import WorkIndex from '../src/pages/work/index.vue'
import { createEmptyWorkDocument } from '../src/utils/workEditor.js'
import * as work from '../src/api/work.js'
import { listLevelCatalog } from '../src/api/level.js'
import { dialog } from '../src/utils/dialog.js'
import { auth } from '../src/store/auth.js'

const routeQuery = vi.hoisted(() => ({}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn()
}))
vi.mock('../src/api/work.js', () => ({
  createWork: vi.fn(), updateWork: vi.fn(), deleteWork: vi.fn(), getOwnedWork: vi.fn(),
  publishWork: vi.fn(), unpublishWork: vi.fn(), previewWorkCompatibility: vi.fn(),
  getWork: vi.fn(), getWorkCompatibility: vi.fn(), listWorks: vi.fn()
}))
vi.mock('../src/api/level.js', () => ({ listLevelCatalog: vi.fn() }))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
vi.mock('../src/store/auth.js', () => ({ auth: { isLoggedIn: false, userInfo: null } }))

const record = (status = 'DRAFT') => ({
  metadata: { id: 'w_1234567890abcdef12345678', revision: 1, status },
  document: { ...createEmptyWorkDocument(), stage_name: '测试关卡', doc: { title: '测试作业', details: '' } }
})
const render = (component, options = {}) => mount(component, {
  ...options,
  attachTo: document.body,
  global: { stubs: { IslandSidebar: true, SiteFooter: true, RouterLink: true, WorkCompatibilityResult: true, WorkCard: true } }
})
const readyEditor = async (options = {}) => {
  const wrapper = render(WorkEditor, options)
  await flushPromises()
  return wrapper
}
const formButton = (wrapper, label) => wrapper.findAll('.form-actions button').find(button => button.text() === label)

beforeEach(() => {
  document.body.innerHTML = ''
  vi.clearAllMocks()
  for (const key of Object.keys(routeQuery)) delete routeQuery[key]
  auth.isLoggedIn = false
  auth.userInfo = null
  listLevelCatalog.mockResolvedValue({ levels: [] })
  work.getOwnedWork.mockResolvedValue(record())
  dialog.confirm.mockResolvedValue(true)
})

it('shows a focusable horizontal-scroll cue for the round table', async () => {
  work.getWork.mockResolvedValue({ metadata: { id: '1', title: '测试作业' }, source: { type: 'native' },
    work: { ...createEmptyWorkDocument(), rounds: [{ round: 1, actions: [{ type: 'attack', slot: 1 }] }] } })
  const wrapper = render(WorkDetail, { props: { id: '1' } }); await flushPromises()
  expect(wrapper.get('.round-scroll-hint').text()).toContain('左右滑动')
  expect(wrapper.get('.round-table-wrap').attributes()).toMatchObject({ role: 'region', tabindex: '0' })
  wrapper.unmount()
})

it('requires confirmation before removing nonempty rounds and actions', async () => {
  const wrapper = await readyEditor()
  await wrapper.get('.command').trigger('click')
  dialog.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  await wrapper.get('.round-editor .danger-link').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.round-editor')).toHaveLength(2)
  await wrapper.get('.round-editor .danger-link').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.round-editor')).toHaveLength(1)
  await wrapper.get('.add-action').trigger('click')
  dialog.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  await wrapper.get('.action-editor .danger-link').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.action-editor')).toHaveLength(2)
  await wrapper.get('.action-editor .danger-link').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.action-editor')).toHaveLength(1)
  expect(dialog.confirm).toHaveBeenCalledTimes(4)
  wrapper.unmount()
})

it('shows failed and successful save results next to mobile form actions', async () => {
  const wrapper = await readyEditor()
  await wrapper.get('[data-work-path="$.stage_name"] input').setValue('测试关卡')
  await wrapper.get('[data-work-path="$.doc.title"] input').setValue('测试作业')
  work.createWork.mockRejectedValueOnce(new Error('网络不可用')).mockResolvedValueOnce(record())
  await wrapper.get('.work-form').trigger('submit'); await flushPromises()
  expect(wrapper.get('.form-action-message').text()).toContain('网络不可用')
  await wrapper.get('.work-form').trigger('submit'); await flushPromises()
  expect(wrapper.get('.form-action-message').text()).toContain('草稿已保存')
  wrapper.unmount()
})

it('names invalid fields and focuses the matching action control', async () => {
  const wrapper = await readyEditor()
  await wrapper.get('[data-work-path="$.stage_name"] input').setValue('测试关卡')
  await wrapper.get('[data-work-path="$.doc.title"] input').setValue('测试作业')
  await wrapper.get('.action-editor select').setValue('wait')
  await wrapper.get('[data-work-path="$.rounds[0].actions[0].duration_ms"] input').setValue('0')
  await wrapper.get('.work-form').trigger('submit'); await flushPromises()
  const issue = wrapper.get('#work-validation-summary button')
  expect(issue.text()).toContain('第 1 回合第 1 个动作')
  expect(issue.text()).not.toContain('$.')
  expect(wrapper.get('.action-editor').classes()).toContain('has-issue')
  await issue.trigger('click')
  expect(document.activeElement).toBe(wrapper.get('[data-work-path="$.rounds[0].actions[0].duration_ms"] input').element)
  expect(work.createWork).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('shows catalog failure and allows retry while retaining manual entry', async () => {
  listLevelCatalog.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ levels: [{ id: 'level-1', game: '如鸢', name: '兰台' }] })
  const wrapper = await readyEditor()
  expect(wrapper.get('.level-load-error').text()).toContain('可手动填写')
  await wrapper.get('.level-load-error button').trigger('click'); await flushPromises()
  expect(wrapper.find('.level-load-error').exists()).toBe(false)
  expect(wrapper.get('[data-work-path="$.level_id"] select').text()).toContain('兰台')
  wrapper.unmount()
})

it('confirms both publishing and removing public visibility', async () => {
  work.publishWork.mockResolvedValue(record('PUBLIC'))
  work.unpublishWork.mockResolvedValue(record('DRAFT'))
  const wrapper = await readyEditor({ props: { id: 'w_1234567890abcdef12345678' } })
  dialog.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  await formButton(wrapper, '发布').trigger('click'); await flushPromises()
  expect(work.publishWork).not.toHaveBeenCalled()
  await formButton(wrapper, '发布').trigger('click'); await flushPromises()
  expect(work.publishWork).toHaveBeenCalledTimes(1)
  await formButton(wrapper, '取消发布').trigger('click'); await flushPromises()
  expect(work.unpublishWork).not.toHaveBeenCalled()
  await formButton(wrapper, '取消发布').trigger('click'); await flushPromises()
  expect(work.unpublishWork).toHaveBeenCalledTimes(1)
  wrapper.unmount()
})

it('offers creation from the empty work plaza', async () => {
  work.listWorks.mockResolvedValue({ items: [], total: 0, hasNext: false })
  const wrapper = render(WorkIndex); await flushPromises()
  expect(wrapper.get('.works-state router-link-stub').attributes('to')).toBe('/work/new')
  expect(wrapper.find('.page-header-actions').exists()).toBe(false)
  wrapper.unmount()
})

it('keeps list counts with content and offers creation without a false live-data claim', async () => {
  work.listWorks.mockResolvedValue({ items: [{ id: '1' }], total: 41, page: 2, limit: 20, has_next: true })
  const wrapper = render(WorkIndex); await flushPromises()
  expect(wrapper.get('h1').text()).toBe('作业广场')
  expect(wrapper.get('.works-summary').text()).toBe('41 份公开作业 · 第 2 / 3 页')
  expect(wrapper.get('.page-header-actions router-link-stub').attributes('to')).toBe('/work/new')
  expect(wrapper.get('header').text()).not.toMatch(/41|在线|实时更新/)
  expect(wrapper.get('.works-pagination').text()).toContain('第 2 页，共 3 页')
  wrapper.unmount()
})

it('identifies the native object and preserves owner editing and return-page context', async () => {
  auth.isLoggedIn = true
  auth.userInfo = { id: 'owner' }
  routeQuery.page = '3'
  work.getWork.mockResolvedValue({ metadata: { id: '1', title: '兰台通关作业', status: 'PUBLIC', owner_id: 'owner' },
    source: { type: 'native' }, work: { ...createEmptyWorkDocument(), doc: { details: '正文中的长打法说明' } } })
  const wrapper = render(WorkDetail, { props: { id: '1' } }); await flushPromises()
  expect(wrapper.get('h1').text()).toBe('兰台通关作业')
  expect(wrapper.get('header').text()).toContain('已发布')
  expect(wrapper.get('header').text()).toContain('原生作业')
  expect(wrapper.get('.page-header-action').attributes('to')).toBe('/work/1/edit')
  expect(wrapper.getComponent('.page-header-back').vm.$attrs.to).toEqual({ path: '/works', query: { page: 3 } })
  expect(wrapper.get('header').text()).not.toContain('正文中的长打法说明')
  expect(wrapper.get('.work-details').text()).toBe('正文中的长打法说明')
  wrapper.unmount()
})

it('does not offer editing to a non-owner and does not invent an unspecified publication state', async () => {
  auth.isLoggedIn = true
  auth.userInfo = { id: 'other' }
  work.getWork.mockResolvedValue({ metadata: { id: '1', title: '测试作业', owner_id: 'owner' },
    source: { type: 'native' }, work: createEmptyWorkDocument() })
  const wrapper = render(WorkDetail, { props: { id: '1' } }); await flushPromises()
  expect(wrapper.find('.page-header-action').exists()).toBe(false)
  expect(wrapper.get('header').text()).not.toMatch(/已发布|草稿/)
  wrapper.unmount()
})

it('distinguishes legacy conversion status and keeps a failed conversion warning visible', async () => {
  work.getWork.mockResolvedValue({ metadata: { id: '1', title: '旧版作业' }, source: { type: 'share' },
    conversion: { status: 'unsupported', issues: [] }, work: null })
  const wrapper = render(WorkDetail, { props: { id: '1' } }); await flushPromises()
  expect(wrapper.get('header').text()).toContain('旧版转换：不兼容')
  expect(wrapper.get('header [role="status"]').text()).toContain('元数据、问题报告与原始来源')
  expect(wrapper.find('.page-header-action').exists()).toBe(false)
  expect(wrapper.get('#legacy-title').text()).toBe('旧版作业转换')
  wrapper.unmount()
})
