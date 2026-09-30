import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import PublicFeedbackManagement from '../src/components/co-creation/PublicFeedbackManagement.vue'
import PublicFeedbackDetailModal from '../src/components/co-creation/PublicFeedbackDetailModal.vue'
import FeedbackPlaza from '../src/components/co-creation/FeedbackPlaza.vue'
import { auth } from '../src/store/auth.js'
import * as managed from '../src/api/feedback.js'
import * as publicApi from '../src/api/coCreation.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('vue-router', () => ({
  useRoute: () => ({ fullPath: '/feedback/plaza', query: {} }),
  useRouter: () => ({ push: vi.fn() }),
  onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn()
}))
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: 'synthetic', userInfo: { id: 'admin' }, adminAccess: { superAdmin: true } }) }
})
vi.mock('../src/api/feedback.js', () => ({
  getManagedFeedback: vi.fn(), publishFeedback: vi.fn(), unpublishFeedback: vi.fn(),
  updateFeedbackPublicStatus: vi.fn(), updateFeedbackType: vi.fn()
}))
vi.mock('../src/api/coCreation.js', () => ({
  listPublicFeedback: vi.fn(), getPublicFeedback: vi.fn(), supportPublicFeedback: vi.fn(), unsupportPublicFeedback: vi.fn()
}))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))

const publicItem = (overrides = {}) => ({ id: 'rpt_1', publicTitle: '已核实的问题', publicSummary: '公开说明', type: 'BUG', publicStatus: 'CONFIRMED', supportCount: 1, ...overrides })
const ticket = (overrides = {}) => ({ ...publicItem(), visibility: 'PUBLIC', publicConsent: true, viewerCanManage: true, content: '私人正文', messages: [{ content: '内部回复' }], ...overrides })
const render = (component = PublicFeedbackManagement, props = { id: 'rpt_1', formatDate: value => value || '' }) => mount(component, {
  props, attachTo: document.body, global: { stubs: { teleport: true, RouterLink: true } }
})
const button = (wrapper, label) => wrapper.findAll('button').find(node => node.text() === label)
const open = async wrapper => { await button(wrapper, '管理此反馈').trigger('click'); await flushPromises() }
function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.accessToken = 'synthetic'
  auth.userInfo = { id: 'admin' }
  auth.adminAccess = { superAdmin: true }
  managed.getManagedFeedback.mockReset().mockResolvedValue(ticket())
  managed.publishFeedback.mockReset().mockResolvedValue(ticket({ publicStatus: 'COMPLETED' }))
  managed.updateFeedbackPublicStatus.mockReset().mockResolvedValue(ticket({ publicConsent: false, publicStatus: 'COMPLETED' }))
  managed.updateFeedbackType.mockReset().mockResolvedValue(ticket({ type: 'FEATURE' }))
  managed.unpublishFeedback.mockReset().mockResolvedValue(ticket({ visibility: 'PRIVATE' }))
  publicApi.getPublicFeedback.mockReset().mockResolvedValue(publicItem())
  publicApi.listPublicFeedback.mockReset().mockResolvedValue({ items: [publicItem()], total: 1 })
  dialog.confirm.mockReset().mockResolvedValue(true)
})

it.each(['visitor', 'user'])('%s 看不到管理入口且不读取内部接口', async kind => {
  auth.adminAccess = {}
  if (kind === 'visitor') { auth.accessToken = ''; auth.userInfo = null }
  const wrapper = render()
  await flushPromises()
  expect(wrapper.find('button').exists()).toBe(false)
  expect(managed.getManagedFeedback).not.toHaveBeenCalled()
})

it.each([{ superAdmin: true }, { operatorAreas: ['OTHER'] }])('管理员按需核对单条权限并直接保存公开状态：%j', async access => {
  auth.adminAccess = access
  const wrapper = render()
  expect(managed.getManagedFeedback).not.toHaveBeenCalled()
  await open(wrapper)
  expect(managed.getManagedFeedback).toHaveBeenCalledWith('rpt_1')
  expect(wrapper.text()).not.toContain('私人正文')
  expect(wrapper.text()).not.toContain('内部回复')
  await wrapper.findAll('select')[1].setValue('COMPLETED')
  publicApi.getPublicFeedback.mockResolvedValue(publicItem({ publicStatus: 'COMPLETED' }))
  await button(wrapper, '保存修改').trigger('click'); await flushPromises()
  expect(managed.publishFeedback).toHaveBeenCalledWith('rpt_1', expect.objectContaining({ publicStatus: 'COMPLETED' }))
  expect(wrapper.emitted('updated').at(-1)[0]).toEqual(publicItem({ publicStatus: 'COMPLETED' }))
  expect(wrapper.emitted('updated').at(-1)[0]).not.toHaveProperty('messages')
  expect(await wrapper.vm.confirmClose()).toBe(true)
  expect(dialog.confirm).not.toHaveBeenCalled()
})

it('历史公开反馈无授权时只修改状态，不重新发布或改类型', async () => {
  managed.getManagedFeedback.mockResolvedValue(ticket({ publicConsent: false }))
  const wrapper = render(); await open(wrapper)
  expect(wrapper.get('input').element.disabled).toBe(true)
  expect(wrapper.get('textarea').element.disabled).toBe(true)
  expect(wrapper.findAll('select')[0].element.disabled).toBe(true)
  await wrapper.findAll('select')[1].setValue('COMPLETED')
  await button(wrapper, '保存修改').trigger('click'); await flushPromises()
  expect(managed.updateFeedbackPublicStatus).toHaveBeenCalledWith('rpt_1', 'COMPLETED')
  expect(managed.publishFeedback).not.toHaveBeenCalled()
  expect(managed.updateFeedbackType).not.toHaveBeenCalled()
})

it.each(['readonly', 'forbidden', 'merged', 'unassigned'])('单条反馈不可管理时不开放写入：%s', async kind => {
  if (kind === 'unassigned') auth.adminAccess = { operatorAreas: ['OTHER'] }
  if (kind === 'forbidden') managed.getManagedFeedback.mockRejectedValue(new Error('无权查看'))
  else managed.getManagedFeedback.mockResolvedValue(ticket(kind === 'merged' ? { mergedIntoId: 'rpt_main' }
    : kind === 'unassigned' ? { workflowStage: 'UNASSIGNED' } : { viewerCanManage: false }))
  const wrapper = render(); await open(wrapper)
  expect(wrapper.get('[role="alert"]').text()).toMatch(/无权|没有/)
  expect(wrapper.find('input').exists()).toBe(false)
  expect(managed.publishFeedback).not.toHaveBeenCalled()
})

it('失败保留草稿，拒绝关闭保留编辑，再次保存成功后可关闭', async () => {
  const wrapper = render(); await open(wrapper)
  await wrapper.get('textarea').setValue('新的公开说明')
  managed.publishFeedback.mockRejectedValueOnce(new Error('保存失败'))
  await button(wrapper, '保存修改').trigger('click'); await flushPromises()
  expect(wrapper.get('textarea').element.value).toBe('新的公开说明')
  expect(wrapper.get('.admin-public-error').text()).toContain('保存失败')
  dialog.confirm.mockResolvedValue(false)
  expect(await wrapper.vm.confirmClose()).toBe(false)
  await button(wrapper, '收起管理').trigger('click'); await flushPromises()
  expect(wrapper.find('textarea').exists()).toBe(true)
  managed.publishFeedback.mockResolvedValue(ticket({ publicSummary: '新的公开说明' }))
  await button(wrapper, '保存修改').trigger('click'); await flushPromises()
  expect(await wrapper.vm.confirmClose()).toBe(true)
})

it.each(['ticket', 'user', 'unmount'])('迟到的权限读取不能污染切换后的界面：%s', async change => {
  const pending = deferred()
  managed.getManagedFeedback.mockReturnValue(pending.promise)
  const wrapper = render()
  await button(wrapper, '管理此反馈').trigger('click')
  await flushPromises()
  if (change === 'ticket') await wrapper.setProps({ id: 'rpt_2' })
  else if (change === 'user') auth.userInfo = { id: 'another-admin' }
  else wrapper.unmount()
  pending.resolve(ticket()); await flushPromises()
  expect(publicApi.getPublicFeedback).not.toHaveBeenCalled()
  expect(wrapper.emitted('updated')).toBeUndefined()
  if (change !== 'unmount') expect(wrapper.find('input').exists()).toBe(false)
})

it('取消公开确认期间切换用户不会以新身份提交旧操作', async () => {
  const wrapper = render(); await open(wrapper)
  const pending = deferred()
  dialog.confirm.mockReturnValue(pending.promise)
  await button(wrapper, '取消公开').trigger('click')
  auth.userInfo = { id: 'another-admin' }
  pending.resolve(true); await flushPromises()
  expect(managed.unpublishFeedback).not.toHaveBeenCalled()
})

it('保存期间切换反馈忽略旧结果且不读取新条目的公开详情', async () => {
  const wrapper = render(); await open(wrapper)
  const pending = deferred()
  managed.publishFeedback.mockReturnValue(pending.promise)
  publicApi.getPublicFeedback.mockClear()
  await wrapper.findAll('select')[1].setValue('COMPLETED')
  await button(wrapper, '保存修改').trigger('click')
  await wrapper.setProps({ id: 'rpt_2' })
  pending.resolve(ticket({ publicStatus: 'COMPLETED' })); await flushPromises()
  expect(publicApi.getPublicFeedback).not.toHaveBeenCalled()
  expect(wrapper.emitted('updated')).toHaveLength(1)
})

it('详情关闭与刷新保护草稿，焦点留在详情弹窗内', async () => {
  const wrapper = render(PublicFeedbackDetailModal, { open: true, item: publicItem(), formatDate: value => value || '' })
  await open(wrapper)
  await wrapper.get('textarea').setValue('未保存的说明')
  dialog.confirm.mockResolvedValue(false)
  await wrapper.get('[aria-label="关闭详情"]').trigger('click'); await flushPromises()
  expect(wrapper.emitted('close')).toBeUndefined()
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  const last = button(wrapper, '取消公开')
  last.element.focus()
  last.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(document.activeElement).toBe(wrapper.get('[aria-label="关闭详情"]').element)
})

it('广场保存刷新卡片，取消公开移除卡片并关闭详情', async () => {
  const wrapper = render(FeedbackPlaza, {})
  await flushPromises()
  await wrapper.get('.public-card').trigger('click'); await flushPromises()
  await open(wrapper)
  await wrapper.findAll('select').at(-1).setValue('COMPLETED')
  publicApi.getPublicFeedback.mockResolvedValue(publicItem({ publicStatus: 'COMPLETED' }))
  publicApi.listPublicFeedback.mockResolvedValue({ items: [publicItem({ publicStatus: 'COMPLETED' })], total: 1 })
  await button(wrapper, '保存修改').trigger('click'); await flushPromises()
  expect(wrapper.get('.public-card').text()).toContain('已完成')
  publicApi.listPublicFeedback.mockResolvedValue({ items: [], total: 0 })
  await button(wrapper, '取消公开').trigger('click'); await flushPromises()
  expect(managed.unpublishFeedback).toHaveBeenCalledWith('rpt_1')
  expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  expect(wrapper.find('.public-card').exists()).toBe(false)
})

it('状态变更移出筛选结果时回退有效页码并继续保留公开详情', async () => {
  let completed = false
  publicApi.listPublicFeedback.mockImplementation(async ({ page }) => ({
    items: completed && page === 2 ? [] : [publicItem()], total: completed ? 12 : 13
  }))
  const wrapper = render(FeedbackPlaza, {}); await flushPromises()
  await wrapper.findAll('.feedback-filter select')[1].setValue('CONFIRMED'); await flushPromises()
  await wrapper.get('[aria-label="下一页"]').trigger('click'); await flushPromises()
  await wrapper.get('.public-card').trigger('click'); await flushPromises()
  await open(wrapper)
  await wrapper.findAll('select').at(-1).setValue('COMPLETED')
  publicApi.getPublicFeedback.mockResolvedValue(publicItem({ publicStatus: 'COMPLETED' }))
  completed = true
  await button(wrapper, '保存修改').trigger('click'); await flushPromises()
  expect(publicApi.listPublicFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, status: 'CONFIRMED' }))
  expect(wrapper.get('.plaza-pagination').text()).toContain('第 1 / 1 页')
  expect(wrapper.get('[role="dialog"]').text()).toContain('已完成')
})
