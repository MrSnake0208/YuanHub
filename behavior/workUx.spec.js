import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import WorkDetail from '../src/pages/work/detail.vue'
import WorkEditor from '../src/pages/work/editor.vue'
import WorkIndex from '../src/pages/work/index.vue'
import { createEmptyWorkDocument } from '../src/utils/workEditor.js'
import * as work from '../src/api/work.js'
import { listLevelCatalog } from '../src/api/level.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
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
  wrapper.unmount()
})
