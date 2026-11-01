import { beforeEach, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'
import ManagedFeedback from '../src/pages/feedback/manage.vue'
import MyFeedback from '../src/pages/feedback/index.vue'
import * as api from '../src/api/feedback.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('../src/api/feedback.js', () => ({
  getFeedback: vi.fn(), getManagedFeedback: vi.fn(), getFeedbackAccess: vi.fn(), getFeedbackSpace: vi.fn(),
  listMyFeedback: vi.fn(), listManagedFeedback: vi.fn(), listWorkflowFeedback: vi.fn(), getFeedbackQueueCounts: vi.fn(),
  listFeedbackWorkflowEvents: vi.fn(), listFeedbackAssignees: vi.fn(), listFeedbackVersionOptions: vi.fn(),
  createFeedback: vi.fn(), appendMyFeedbackMessage: vi.fn(), appendManagedFeedbackMessage: vi.fn(),
  updateMyFeedbackStatus: vi.fn(), updateManagedFeedbackStatus: vi.fn(), downloadFeedbackAttachment: vi.fn(),
  claimFeedback: vi.fn(), assignFeedback: vi.fn(), handoffFeedback: vi.fn(), changeFeedbackWorkArea: vi.fn(), returnFeedback: vi.fn(),
  mergeFeedback: vi.fn(), publishFeedback: vi.fn(), unpublishFeedback: vi.fn(), updateFeedbackPublicStatus: vi.fn()
}))
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn(), prompt: vi.fn(), choose: vi.fn() } }))
vi.mock('../src/api/coCreation.js', () => ({ findSimilarFeedback: vi.fn().mockResolvedValue([]) }))
vi.mock('../src/api/notifications.js', () => ({ markFeedbackNotificationsRead: vi.fn().mockResolvedValue([]) }))
vi.mock('../src/store/auth.js', () => ({ auth: { userInfo: { id: 'manager' }, adminAccess: { superAdmin: false } } }))
vi.mock('../src/store/feedbackUnread.js', () => ({
  feedbackUnreadState: { ids: [], count: 0 }, managedFeedbackUnreadIds: () => [],
  subscribeFeedbackUnread: () => () => {}, refreshFeedbackUnread: vi.fn(), markAllManagedFeedbackRead: vi.fn()
}))
vi.mock('../src/store/notificationUnread.js', () => ({
  notificationUnreadState: { feedbackRefIds: [] }, subscribeNotificationUnread: () => () => {},
  refreshNotificationUnreadDetails: vi.fn(), removeNotificationUnreadItems: vi.fn()
}))
const spaces = [{ id: 'partner-a', label: '平台 A', active: true }, { id: 'partner-b', label: '平台 B', active: true }]
const categories = spaces.map((space, index) => ({ key: `CUSTOM_${index}`, label: '使用问题', space_id: space.id }))
const access = () => ({ manageable_spaces: spaces, spaces, available_categories: categories, operator_areas: ['CUSTOM_0', 'CUSTOM_1'], developer_areas: [] })
const ticket = space => ({
  id: `ticket-${space}`, spaceId: space, type: 'BUG', category: space === 'partner-a' ? 'CUSTOM_0' : 'CUSTOM_1',
  workArea: space === 'partner-a' ? 'CUSTOM_0' : 'CUSTOM_1', content: `私有内容 ${space}`, status: 'OPEN',
  viewerIsReporter: true, viewerCanManage: true, workflowStage: 'PROCESSING', messages: [], quota: { canAppend: true }
})
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
async function render(path) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/feedback/plaza', component: { template: '<div />' } }, { path: '/feedback/manage', component: ManagedFeedback }, { path: '/feedback', component: MyFeedback }
  ] })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(RouterView, { global: { plugins: [router], stubs: { IslandSidebar: true, teleport: true } } })
  await flushPromises()
  return { wrapper, router }
}
beforeEach(() => {
  vi.clearAllMocks()
  api.getFeedbackAccess.mockResolvedValue(access())
  api.getFeedbackSpace.mockImplementation(async id => spaces.find(space => space.id === id))
  api.listWorkflowFeedback.mockImplementation(async ({ spaceId }) => ({ items: [ticket(spaceId)], total: 1 }))
  api.listMyFeedback.mockResolvedValue({ items: [], total: 0 })
  api.getFeedbackQueueCounts.mockResolvedValue({ UNASSIGNED: 1 })
  api.getManagedFeedback.mockImplementation(async id => ticket(id.replace('ticket-', '')))
  api.getFeedback.mockImplementation(async id => ticket(id.replace('ticket-', '')))
  dialog.confirm.mockResolvedValue(false)
})

it('单专区管理员从原入口直接进入授权专区，列表和统计均不请求主站', async () => {
  api.getFeedbackAccess.mockResolvedValue({ ...access(), manageable_spaces: [spaces[0]], operator_areas: ['CUSTOM_0'] })
  const { wrapper, router } = await render('/feedback/manage')
  expect(router.currentRoute.value.query.space).toBe('partner-a')
  expect(wrapper.find('.feedback-space-context select').exists()).toBe(false)
  expect(wrapper.get('.feedback-space-context').text()).toContain('平台 A')
  expect(api.listWorkflowFeedback).toHaveBeenCalledWith(expect.objectContaining({ spaceId: 'partner-a' }))
  expect(api.listWorkflowFeedback.mock.calls.every(([params]) => params.spaceId === 'partner-a')).toBe(true)
  expect(api.getFeedbackQueueCounts).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ spaceId: 'partner-a' }))
  wrapper.unmount()
})

it('A 请求晚到不会覆盖 B 的列表、统计和板块；专区与队列分别切换', async () => {
  const { wrapper, router } = await render('/feedback/manage?space=partner-a')
  const oldList = deferred(), oldCounts = deferred()
  api.listWorkflowFeedback.mockImplementationOnce(() => oldList.promise)
  api.getFeedbackQueueCounts.mockImplementationOnce(() => oldCounts.promise)
  await wrapper.get('form[role="search"]').trigger('submit')
  await wrapper.get('[aria-label="当前反馈专区"]').setValue('partner-b')
  await flushPromises()
  expect(router.currentRoute.value.query.space).toBe('partner-b')
  expect(wrapper.get('.ticket-table').text()).toContain('私有内容 partner-b')
  const boardOptions = wrapper.findAll('.feedback-filter select')[0].findAll('option').map(option => option.element.value)
  expect(boardOptions).toContain('CUSTOM_1')
  expect(boardOptions).not.toContain('CUSTOM_0')
  oldList.resolve({ items: [ticket('partner-a')], total: 99 })
  oldCounts.resolve({ UNASSIGNED: 99 })
  await flushPromises()
  expect(wrapper.get('.ticket-table').text()).not.toContain('私有内容 partner-a')
  expect(wrapper.get('.feedback-primary-queues').text()).not.toContain('99')
  wrapper.unmount()
})

it('拒绝离开确认保留 A 回复草稿，确认后切 B 且不发送旧草稿', async () => {
  const { wrapper, router } = await render('/feedback/manage?space=partner-a')
  await wrapper.get('tbody tr').trigger('click'); await flushPromises()
  await wrapper.findAll('.feedback-detail-actions button').find(button => button.text().includes('回复')).trigger('click')
  await wrapper.get('.feedback-reply-form textarea').setValue('A 的回复草稿')
  await wrapper.get('[aria-label="当前反馈专区"]').setValue('partner-b'); await flushPromises()
  expect(router.currentRoute.value.query.space).toBe('partner-a')
  expect(wrapper.get('.feedback-reply-form textarea').element.value).toBe('A 的回复草稿')
  dialog.confirm.mockResolvedValue(true)
  await wrapper.get('[aria-label="当前反馈专区"]').setValue('partner-b'); await flushPromises()
  expect(router.currentRoute.value.query.space).toBe('partner-b')
  expect(wrapper.find('.feedback-reply-form').exists()).toBe(false)
  expect(api.appendManagedFeedbackMessage).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('合作方提交不要求另选平台；失败保留内容，重试固定提交到填写专区', async () => {
  const { wrapper } = await render('/feedback?space=partner-a&new=1')
  await wrapper.get('.feedback-modal select').setValue('CUSTOM_0')
  await wrapper.get('.feedback-modal textarea').setValue('需要保留的问题描述')
  api.createFeedback.mockRejectedValueOnce(new Error('连接失败')).mockResolvedValueOnce(ticket('partner-a'))
  await wrapper.get('.feedback-modal form').trigger('submit'); await flushPromises()
  expect(wrapper.get('.feedback-modal textarea').element.value).toBe('需要保留的问题描述')
  expect(wrapper.get('.feedback-modal').text()).toContain('连接失败')
  await wrapper.get('.feedback-modal form').trigger('submit'); await flushPromises()
  expect(api.createFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ spaceId: 'partner-a', category: 'CUSTOM_0', content: '需要保留的问题描述' }))
  expect(wrapper.find('.feedback-modal').exists()).toBe(false)
  wrapper.unmount()
})

it('个人所有专区历史只改变列表范围，提交上下文仍为原专区', async () => {
  const { wrapper, router } = await render('/feedback?space=partner-a')
  await wrapper.get('.feedback-history-link a').trigger('click'); await flushPromises()
  expect(router.currentRoute.value.query).toEqual({ space: 'partner-a', history: 'all' })
  expect(api.listMyFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ spaceId: 'all' }))
  expect(wrapper.get('.feedback-space-context select').element.value).toBe('partner-a')
  wrapper.unmount()
})
