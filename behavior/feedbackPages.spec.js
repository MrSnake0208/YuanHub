import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router'
import MyFeedback from '../src/pages/feedback/index.vue'
import ManagedFeedback from '../src/pages/feedback/manage.vue'
import FeedbackAttachmentPicker from '../src/components/feedback/FeedbackAttachmentPicker.vue'
import * as api from '../src/api/feedback.js'
import { markFeedbackNotificationsRead } from '../src/api/notifications.js'
import { uploadMedia } from '../src/api/media.js'
import { dialog } from '../src/utils/dialog.js'
import SimilarFeedbackList from '../src/components/co-creation/SimilarFeedbackList.vue'
import AdminFeedbackPublishPanel from '../src/components/feedback/AdminFeedbackPublishPanel.vue'
import AdminFeedbackMergeDialog from '../src/components/feedback/AdminFeedbackMergeDialog.vue'
import { feedbackUnreadState, markAllManagedFeedbackRead } from '../src/store/feedbackUnread.js'
import { auth } from '../src/store/auth.js'
import { findSimilarFeedback } from '../src/api/coCreation.js'

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ query: {} })
  return { useRoute: () => route, useRouter: () => ({ replace: vi.fn() }), onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn() }
})
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn(), prompt: vi.fn() } }))
vi.mock('../src/api/feedback.js', () => ({
  getFeedback: vi.fn(), getManagedFeedback: vi.fn(), getFeedbackAccess: vi.fn(), listMyFeedback: vi.fn(), listManagedFeedback: vi.fn(), listWorkflowFeedback: vi.fn(), listFeedbackWorkflowEvents: vi.fn(),
  getFeedbackQueueCounts: vi.fn(),
  claimFeedback: vi.fn(), assignFeedback: vi.fn(), handoffFeedback: vi.fn(), changeFeedbackWorkArea: vi.fn(), returnFeedback: vi.fn(), listFeedbackAssignees: vi.fn(),
  createFeedback: vi.fn(), appendMyFeedbackMessage: vi.fn(), appendManagedFeedbackMessage: vi.fn(),
  updateMyFeedbackStatus: vi.fn(), updateManagedFeedbackStatus: vi.fn(), downloadFeedbackAttachment: vi.fn(),
  mergeFeedback: vi.fn(), publishFeedback: vi.fn(), unpublishFeedback: vi.fn(), updateFeedbackType: vi.fn(), updateFeedbackVersions: vi.fn(),
  listFeedbackVersionOptions: vi.fn(() => Promise.resolve([]))
}))
vi.mock('../src/api/notifications.js', () => ({
  listUnreadNotifications: vi.fn().mockResolvedValue([]),
  getUnreadFeedbackNotificationRefs: () => [],
  markFeedbackNotificationsRead: vi.fn().mockResolvedValue([])
}))
vi.mock('../src/api/media.js', () => ({ uploadMedia: vi.fn() }))
vi.mock('../src/api/coCreation.js', () => ({ findSimilarFeedback: vi.fn(), supportPublicFeedback: vi.fn(), unsupportPublicFeedback: vi.fn() }))
vi.mock('../src/api/changelog.js', () => ({
  // restoreMocks 会重置 mockResolvedValue,因此用默认实现保证版本选择器不触发真实请求。
  listChangelog: vi.fn(() => Promise.resolve({ data: [], page: 1, total: 0, hasNext: false }))
}))
vi.mock('../src/store/auth.js', () => ({ auth: { userInfo: { id: 'tester' }, adminAccess: { superAdmin: true, permissions: [] } } }))
vi.mock('../src/store/feedbackUnread.js', () => ({
  feedbackUnreadState: { ids: [], count: 0 }, subscribeFeedbackUnread: () => () => {}, refreshFeedbackUnread: vi.fn(), markAllManagedFeedbackRead: vi.fn()
}))
vi.mock('../src/store/notificationUnread.js', () => ({
  notificationUnreadState: { feedbackRefIds: [] },
  refreshNotificationUnreadDetails: vi.fn().mockResolvedValue([]),
  removeNotificationUnreadItems: vi.fn(),
  subscribeNotificationUnread: () => () => {}
}))

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const ticket = id => ({
  id, type: 'BUG', category: 'OPERATOR', status: 'OPEN', content: `issue ${id}`,
  viewerIsReporter: true, viewerCanManage: true, quota: { canAppend: true, pendingCount: 0, pendingLimit: 3 },
  messages: [{ id: `${id}-initial`, senderKind: 'REPORTER', isAdmin: false, content: `conversation ${id}`, author: { id: 'tester' } }]
})
const summary = id => ({ ...ticket(id), messages: [], quota: null, viewerCanManage: false, viewerIsReporter: false })
const render = (component, options = {}) => mount(component, {
  ...options,
  global: {
    ...(options.global || {}),
    stubs: { IslandSidebar: true, AdminBackLink: true, FeedbackWorkspaceNav: true, teleport: true, RouterLink: true }
  }
})
const choose = async (wrapper, id) => {
  const row = wrapper.findAll('tbody tr').find(row => row.text().includes(id))
  expect(row, `Missing ticket row ${id}`).toBeTruthy()
  await row.trigger('click'); await flushPromises()
}
const close = async wrapper => { await wrapper.get('[aria-label="关闭工单详情"]').trigger('click'); await flushPromises() }
const compose = async (wrapper, text) => {
  await wrapper.get('.feedback-detail-actions button').trigger('click')
  await wrapper.get('.feedback-reply-form textarea').setValue(text)
}

it.each(['关闭按钮', '遮罩', 'Escape', '取消回复'])('管理员回复草稿在%s关闭时可保留正文和附件', async method => {
  const wrapper = render(ManagedFeedback, { attachTo: document.body }); await flushPromises()
  await choose(wrapper, 'rpt_a'); await compose(wrapper, '需要保留的回复')
  const media = wrapper.findComponent(FeedbackAttachmentPicker).props('media')
  media.addFiles([new File(['log'], 'draft.log', { type: 'text/plain' })])
  dialog.confirm.mockResolvedValue(false)
  if (method === '关闭按钮') await close(wrapper)
  else if (method === '遮罩') await wrapper.get('.ticket-detail-mask').trigger('click')
  else if (method === 'Escape') document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  else await wrapper.get('.feedback-reply-form .feedback-button').trigger('click')
  await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ cancelText: '继续编辑' }))
  expect(wrapper.get('.feedback-reply-form textarea').element.value).toBe('需要保留的回复')
  expect(media.items).toHaveLength(1)
  dialog.confirm.mockResolvedValue(true)
  await close(wrapper)
  expect(wrapper.find('.ticket-detail-dialog').exists()).toBe(false)
  wrapper.unmount()
})

it('取消流转草稿须确认，拒绝后保留处理说明', async () => {
  api.getManagedFeedback.mockResolvedValue({ ...ticket('rpt_a'), workflowStage: 'PROCESSING' })
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  await wrapper.findAll('button').find(button => button.text() === '工单流转').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '调整板块').trigger('click')
  await wrapper.get('.feedback-workflow-form textarea').setValue('分类说明')
  dialog.confirm.mockResolvedValue(false)
  await wrapper.get('.feedback-workflow-form .feedback-button').trigger('click'); await flushPromises()
  expect(wrapper.get('.feedback-workflow-form textarea').element.value).toBe('分类说明')
  wrapper.unmount()
})

it.each([
  [0, 'EXPERIENCE', ''], [1, 'STAR', ''], [2, 'updated', 'oldest'], [3, '30', '20']
])('放弃回复草稿被取消时恢复第 %s 个筛选控件', async (index, next, previous) => {
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a'); await compose(wrapper, '保留回复')
  dialog.confirm.mockResolvedValue(false)
  const calls = api.listWorkflowFeedback.mock.calls.length
  const select = wrapper.findAll('.feedback-filter select')[index]
  await select.setValue(next); await flushPromises()
  expect(select.element.value).toBe(previous)
  expect(api.listWorkflowFeedback).toHaveBeenCalledTimes(calls)
  expect(wrapper.get('.feedback-reply-form textarea').element.value).toBe('保留回复')
  wrapper.unmount()
})

it('回复草稿在离开路由、改变详情路由和刷新前均受保护', async () => {
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a'); await compose(wrapper, '尚未发送')
  dialog.confirm.mockResolvedValue(false)
  expect(await onBeforeRouteLeave.mock.calls.at(-1)[0]()).toBe(false)
  expect(await onBeforeRouteUpdate.mock.calls.at(-1)[0]()).toBe(false)
  const unload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(unload)
  expect(unload.defaultPrevented).toBe(true)
  expect(wrapper.get('.feedback-reply-form textarea').element.value).toBe('尚未发送')
  wrapper.unmount()
})

it('允许切换详情路由后清理旧草稿且不会重复确认', async () => {
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a'); await compose(wrapper, '旧草稿')
  expect(await onBeforeRouteUpdate.mock.calls.at(-1)[0]()).toBe(true)
  useRoute().query = { id: 'rpt_b' }; await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledTimes(1)
  expect(wrapper.find('.feedback-reply-form').exists()).toBe(false)
  expect(wrapper.get('.ticket-detail-dialog').text()).toContain('conversation rpt_b')
  wrapper.unmount()
})

it('工单编号复制有结果提示，失败可手动复制且不误开详情', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  const wrapper = render(ManagedFeedback); await flushPromises()
  const copy = wrapper.findAll('tbody tr')[0].get('.ticket-copy')
  await copy.trigger('click'); await flushPromises()
  expect(writeText).toHaveBeenCalledWith('rpt_a')
  expect(wrapper.get('.ticket-copy-message').text()).toContain('已复制')
  expect(api.getManagedFeedback).not.toHaveBeenCalled()
  writeText.mockRejectedValueOnce(new Error('无剪贴板权限'))
  await copy.trigger('click'); await flushPromises()
  expect(wrapper.get('.ticket-copy-message').text()).toContain('手动复制')
  wrapper.unmount()
})

it('运营能发现交回与需回复队列，排序请求由服务端处理', async () => {
  api.getFeedbackAccess.mockResolvedValue({ operator_areas: ['STAR'], developer_areas: [], available_categories: [{ key: 'STAR', label: '星石' }] })
  const wrapper = render(ManagedFeedback); await flushPromises()
  const returned = wrapper.findAll('[role="tab"]').find(tab => tab.text().startsWith('已交回运营'))
  expect(returned.text()).toContain('4')
  await returned.trigger('click'); await flushPromises()
  expect(api.listWorkflowFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ queue: 'RETURNED', sortBy: 'createdAt', sortOrder: 'asc' }))
  await wrapper.findAll('[role="tab"]').find(tab => tab.text().startsWith('需我回复')).trigger('click'); await flushPromises()
  await wrapper.get('[aria-label="反馈排序"]').setValue('updated'); await flushPromises()
  expect(api.listWorkflowFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ queue: 'NEEDS_REPLY', sortBy: 'updatedAt', sortOrder: 'desc' }))
  expect(wrapper.findAll('.feedback-filter select')[0].findAll('option').some(option => option.element.value === 'EXPERIENCE')).toBe(true)
  wrapper.unmount()
})

it('较慢的旧筛选计数不能覆盖新筛选，失败不伪造零', async () => {
  const old = deferred()
  api.getFeedbackQueueCounts.mockReturnValueOnce(old.promise).mockResolvedValueOnce({ UNASSIGNED: 8 })
  const wrapper = render(ManagedFeedback); await flushPromises()
  await wrapper.findAll('.feedback-filter select')[0].setValue('EXPERIENCE'); await flushPromises()
  old.resolve({ UNASSIGNED: 99 }); await flushPromises()
  expect(wrapper.findAll('[role="tab"]')[0].text()).toContain('8')
  expect(wrapper.findAll('[role="tab"]')[0].text()).not.toContain('99')
  api.getFeedbackQueueCounts.mockRejectedValue(new Error('离线'))
  await wrapper.get('form[role="search"]').trigger('submit'); await flushPromises()
  expect(wrapper.text()).toContain('队列数量暂不可用')
  expect(wrapper.findAll('[role="tab"]')[0].text()).toContain('—')
  wrapper.unmount()
})

it.each(['RESOLVED', 'DISMISSED'])('%s 成功后保留第2页和筛选并显示结果', async status => {
  const items = Array.from({ length: 65 }, (_, index) => summary(`rpt_${index}`))
  api.listWorkflowFeedback.mockImplementation(async ({ page, pageSize }) => ({ items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length }))
  api.getManagedFeedback.mockImplementation(async id => ({ ...ticket(id), workflowStage: 'PROCESSING' }))
  api.updateManagedFeedbackStatus.mockResolvedValue({})
  const wrapper = render(ManagedFeedback); await flushPromises()
  await wrapper.findAll('.feedback-filter select')[0].setValue('BUG'); await flushPromises()
  await wrapper.get('[aria-label="下一页"]').trigger('click'); await flushPromises()
  await choose(wrapper, 'rpt_20')
  await wrapper.findAll('.feedback-action-toolbar button').find(button => button.text() === (status === 'RESOLVED' ? '标记完成' : '驳回')).trigger('click'); await flushPromises()
  expect(api.updateManagedFeedbackStatus).toHaveBeenCalledWith('rpt_20', status, status === 'RESOLVED' ? null : '不属于本板块的反馈')
  expect(api.listWorkflowFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, type: 'BUG' }))
  expect(wrapper.find('.ticket-detail-dialog').exists()).toBe(false)
  expect(wrapper.get('.feedback-page-message').text()).toContain(status === 'RESOLVED' ? '已完成' : '已驳回')
  wrapper.unmount()
})

it('完成确认期间切换工单不能将结果写到旧工单', async () => {
  const pending = deferred()
  dialog.confirm.mockReturnValue(pending.promise)
  api.getManagedFeedback.mockImplementation(async id => ({ ...ticket(id), workflowStage: 'PROCESSING' }))
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  await wrapper.findAll('.feedback-action-toolbar button').find(button => button.text() === '标记完成').trigger('click'); await flushPromises()
  await close(wrapper); await choose(wrapper, 'rpt_b')
  pending.resolve(true); await flushPromises()
  expect(api.updateManagedFeedbackStatus).not.toHaveBeenCalled()
  expect(wrapper.get('.ticket-detail-dialog').text()).toContain('conversation rpt_b')
  wrapper.unmount()
})

it('全部已读明确包含筛选之外工单，取消或切换身份都不写入', async () => {
  feedbackUnreadState.count = 12
  const wrapper = render(ManagedFeedback); await flushPromises()
  dialog.confirm.mockResolvedValue(false)
  await wrapper.get('.feedback-mark-read-button').trigger('click'); await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('包含当前筛选之外') }))
  expect(markAllManagedFeedbackRead).not.toHaveBeenCalled()
  const pending = deferred(); dialog.confirm.mockReturnValue(pending.promise)
  await wrapper.get('.feedback-mark-read-button').trigger('click'); await flushPromises()
  auth.userInfo = { id: 'another-admin' }
  pending.resolve(true); await flushPromises()
  expect(markAllManagedFeedbackRead).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('全部已读确认后只标记阅读状态并显示结果', async () => {
  feedbackUnreadState.count = 12
  markAllManagedFeedbackRead.mockResolvedValue(12)
  const wrapper = render(ManagedFeedback); await flushPromises()
  await wrapper.get('.feedback-mark-read-button').trigger('click'); await flushPromises()
  expect(markAllManagedFeedbackRead).toHaveBeenCalledTimes(1)
  expect(api.updateManagedFeedbackStatus).not.toHaveBeenCalled()
  expect(wrapper.get('.feedback-page-message').text()).toContain('工单处理状态未改变')
  wrapper.unmount()
})

it('合并弹窗初始打开可检索，切换来源会清除旧目标', async () => {
  const pending = deferred()
  api.listManagedFeedback.mockResolvedValueOnce({ items: [summary('target')] }).mockReturnValueOnce(pending.promise)
  const wrapper = mount(AdminFeedbackMergeDialog, { props: { open: true, sourceId: 'source_a' }, global: { stubs: { teleport: true } } })
  await flushPromises()
  await wrapper.get('.merge-list button').trigger('click')
  await wrapper.setProps({ sourceId: 'source_b' })
  expect(wrapper.find('.merge-selected').exists()).toBe(false)
  expect(wrapper.get('.modal-foot .feedback-primary-action').attributes('disabled')).toBeDefined()
  await wrapper.setProps({ open: false })
  pending.resolve({ items: [summary('late')] }); await flushPromises()
  await wrapper.setProps({ open: true }); await flushPromises()
  expect(wrapper.find('.merge-selected').exists()).toBe(false)
  expect(wrapper.find('.merge-list').exists()).toBe(false)
  wrapper.unmount()
})

it('合并搜索变化立即清除旧目标，过期搜索不能恢复旧结果', async () => {
  vi.useFakeTimers()
  const pending = deferred()
  api.listManagedFeedback.mockResolvedValueOnce({ items: [{ ...summary('target_a'), publicTitle: '主反馈 A' }] }).mockReturnValueOnce(pending.promise)
  const wrapper = mount(AdminFeedbackMergeDialog, { props: { open: false, sourceId: 'source', sourceTitle: '当前问题' }, global: { stubs: { teleport: true } } })
  await wrapper.setProps({ open: true }); await flushPromises()
  expect(wrapper.get('.merge-lead').text()).toContain('当前问题')
  expect(wrapper.get('.merge-lead').text()).toContain('source')
  await wrapper.get('.merge-list button').trigger('click')
  expect(wrapper.get('.merge-selected').text()).toContain('主反馈 A')
  await wrapper.get('[aria-label="搜索已有反馈"]').setValue('B')
  expect(wrapper.get('.modal-foot .feedback-primary-action').attributes('disabled')).toBeDefined()
  await vi.advanceTimersByTimeAsync(300); await flushPromises()
  api.listManagedFeedback.mockResolvedValueOnce({ items: [{ ...summary('target_c'), publicTitle: '主反馈 C' }] })
  await wrapper.get('[aria-label="搜索已有反馈"]').setValue('C')
  await vi.advanceTimersByTimeAsync(300); await flushPromises()
  pending.resolve({ items: [summary('target_b')] }); await flushPromises()
  expect(wrapper.get('.merge-list').text()).toContain('主反馈 C')
  expect(wrapper.get('.merge-list').text()).not.toContain('target_b')
  await wrapper.get('.merge-list button').trigger('click')
  await wrapper.get('.modal-foot .feedback-primary-action').trigger('click')
  expect(wrapper.emitted('confirm')).toEqual([['target_c']])
  wrapper.unmount()
})

it('详情限制Tab，二级发布弹窗关闭后返回详情且Escape不穿透', async () => {
  api.getManagedFeedback.mockResolvedValue({ ...ticket('rpt_a'), workflowStage: 'PROCESSING', publicConsent: true })
  const wrapper = render(ManagedFeedback, { attachTo: document.body }); await flushPromises()
  const opener = wrapper.findAll('tbody tr')[0].element; opener.focus()
  await choose(wrapper, 'rpt_a')
  const panel = wrapper.get('.ticket-detail-dialog').element
  expect(panel.contains(document.activeElement)).toBe(true)
  const closeButton = wrapper.get('[aria-label="关闭工单详情"]').element
  closeButton.focus(); closeButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }))
  expect(panel.contains(document.activeElement)).toBe(true)
  expect(document.activeElement).not.toBe(closeButton)
  await wrapper.findAll('.feedback-action-toolbar button').find(button => button.text() === '管理操作').trigger('click')
  const publishOpener = wrapper.get('[aria-label="管理操作选项"] button').element; publishOpener.focus(); publishOpener.click(); await flushPromises()
  expect(wrapper.get('.feedback-management-dialog').element.contains(document.activeElement)).toBe(true)
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await flushPromises()
  expect(wrapper.find('.feedback-management-dialog').exists()).toBe(false)
  expect(wrapper.find('.ticket-detail-dialog').exists()).toBe(true)
  expect(panel.contains(document.activeElement)).toBe(true)
  await close(wrapper)
  expect(document.activeElement).toBe(opener)
  wrapper.unmount()
})

it('keeps reporter messages on the left and admin messages on the right', () => {
  const source = readFileSync(join(process.cwd(), 'src/components/feedback/FeedbackTicketDetail.vue'), 'utf8')
  const declarationsFor = selector => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const match = source.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
    expect(match, `Missing style rule for ${selector}`).toBeTruthy()
    return match[1]
  }

  // 组件在 5822bc1 之后按「自己 / 对方」对齐气泡（对方靠左，自己靠右）。
  // 管理员查看工单时，提交人 = is-other（左），管理员 = is-self（右），与本用例意图一致。
  expect(declarationsFor('.detail-message.is-other')).toContain('justify-self: start')
  expect(declarationsFor('.detail-message.is-self')).toContain('justify-self: end')
  expect(declarationsFor('.detail-message.is-self header')).toContain('flex-direction: row-reverse')
  expect(declarationsFor('.detail-message.is-self > p')).toContain('margin-left: auto')
})

beforeEach(() => {
  vi.clearAllMocks()
  findSimilarFeedback.mockReset().mockResolvedValue([])
  useRoute().query = {}
  api.getFeedbackAccess.mockReset().mockResolvedValue({ super_admin: true, available_categories: [
    { key: 'OPERATOR', label: '密探养成' }, { key: 'STAR', label: '星石' }, { key: 'MAAYUAN', label: '麻圆' }
  ] })
  api.getFeedback.mockReset().mockImplementation(async id => ticket(id))
  api.getManagedFeedback.mockReset().mockImplementation(async id => ticket(id))
  const list = { items: [summary('rpt_a'), summary('rpt_b')], total: 40 }
  api.listMyFeedback.mockReset().mockResolvedValue(list)
  api.listManagedFeedback.mockReset().mockResolvedValue(list)
  api.listWorkflowFeedback.mockReset().mockResolvedValue(list)
  api.getFeedbackQueueCounts.mockReset().mockResolvedValue({ UNASSIGNED: 2, MINE: 3, NEEDS_REPLY: 1, RETURNED: 4, ALL: 40 })
  feedbackUnreadState.count = 0
  markAllManagedFeedbackRead.mockReset().mockResolvedValue(0)
  auth.userInfo = { id: 'tester' }
  api.listFeedbackWorkflowEvents.mockReset().mockResolvedValue([])
  api.listFeedbackAssignees.mockReset().mockResolvedValue([])
  api.claimFeedback.mockReset()
  api.assignFeedback.mockReset()
  api.handoffFeedback.mockReset()
  api.changeFeedbackWorkArea.mockReset()
  api.returnFeedback.mockReset()
  api.appendMyFeedbackMessage.mockReset()
  api.appendManagedFeedbackMessage.mockReset()
  api.createFeedback.mockReset()
  api.updateMyFeedbackStatus.mockReset()
  api.updateManagedFeedbackStatus.mockReset()
  api.listFeedbackVersionOptions.mockReset().mockResolvedValue([])
  api.publishFeedback.mockReset()
  api.unpublishFeedback.mockReset()
  api.updateFeedbackType.mockReset()
  api.updateFeedbackVersions.mockReset()
  uploadMedia.mockReset()
  markFeedbackNotificationsRead.mockClear()
  dialog.confirm.mockResolvedValue(true)
  dialog.prompt.mockReset().mockResolvedValue('不属于本板块的反馈')
})

it('提交链接直接打开私人表单并预选功能建议', async () => {
  useRoute().query = { new: '1', type: 'FEATURE' }
  const wrapper = render(MyFeedback)
  await flushPromises()
  const form = wrapper.get('.feedback-modal form')
  expect(form.findAll('select')[0].element.value).toBe('FEATURE')
  expect(form.text()).toContain('原始正文、附件与账号信息不会直接公开')
  expect(api.createFeedback).not.toHaveBeenCalled()
})

it('管理员工作台默认显示待接单，并可切回全部', async () => {
  const wrapper = render(ManagedFeedback)
  await flushPromises()
  expect(api.listWorkflowFeedback).toHaveBeenCalledWith(expect.objectContaining({ queue: 'UNASSIGNED' }))
  expect(wrapper.findAll('.feedback-status-tabs button').find(button => button.text().split(/\s+/)[0] === '待接单').attributes('aria-selected')).toBe('true')
  expect(wrapper.get('.feedback-result-meta').text()).toContain('当前筛选共 40 条')

  await wrapper.findAll('.feedback-status-tabs button').find(button => button.text().split(/\s+/)[0] === '全部').trigger('click')
  await flushPromises()
  expect(api.listWorkflowFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ queue: 'ALL' }))
  wrapper.unmount()
})

it('接单后保留待接单队列和已接详情，关闭后可继续选择下一单', async () => {
  let detail = { ...ticket('rpt_a'), workflowStage: 'UNASSIGNED', workArea: 'OPERATOR' }
  api.listWorkflowFeedback.mockImplementation(async ({ queue }) => ({
    items: queue === 'UNASSIGNED' ? (detail.workflowStage === 'UNASSIGNED' ? [summary('rpt_a'), summary('rpt_b')] : [summary('rpt_b')]) : [summary('rpt_a')],
    total: queue === 'UNASSIGNED' && detail.workflowStage === 'UNASSIGNED' ? 2 : 1
  }))
  api.getManagedFeedback.mockImplementation(async () => detail)
  api.claimFeedback.mockImplementation(async () => (detail = { ...detail, workflowStage: 'PROCESSING', operatorAssigneeName: '测试运营' }))
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  expect(wrapper.get('.detail-action-area').text()).toContain('接单')
  expect(wrapper.find('[aria-label="工单流转"]').exists()).toBe(false)
  await wrapper.findAll('button').find(button => button.text() === '接单').trigger('click')
  await flushPromises()
  expect(api.claimFeedback).toHaveBeenCalledWith('rpt_a')
  expect(api.listFeedbackWorkflowEvents).not.toHaveBeenCalled()
  expect(wrapper.get('[role="dialog"]').text()).toContain('测试运营')
  expect(api.listWorkflowFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ queue: 'UNASSIGNED' }))
  expect(wrapper.findAll('.feedback-status-tabs button').find(button => button.text().split(/\s+/)[0] === '待接单').attributes('aria-selected')).toBe('true')
  expect(wrapper.get('.ticket-detail-meta').text()).toContain('处理中')
  expect(wrapper.get('.feedback-result-meta').text()).toContain('当前筛选共 1 条')
  expect(wrapper.findAll('tbody tr').some(row => row.text().includes('rpt_a'))).toBe(false)
  await close(wrapper)
  expect(wrapper.findAll('tbody tr')).toHaveLength(1)
  await wrapper.findAll('.feedback-status-tabs button').find(button => button.text().split(/\s+/)[0] === '我负责').trigger('click')
  await flushPromises()
  await choose(wrapper, 'rpt_a')
  expect(wrapper.get('.ticket-detail-meta').text()).toContain('处理中')
  expect(wrapper.get('.ticket-detail-meta').text()).toContain('测试运营')
  expect(wrapper.find('[aria-label="工单流转"]').exists()).toBe(false)
  expect(wrapper.findAll('.feedback-action-toolbar button').some(button => button.text() === '接单')).toBe(false)
  wrapper.unmount()
})

it.each([20, 30, 50])('每页 %i 条时连续接单保持筛选、数量与有效页码', async pageSize => {
  const unassigned = Array.from({ length: pageSize * 2 + 4 }, (_, index) => summary(`rpt_${index}`))
  api.listWorkflowFeedback.mockImplementation(async ({ page, pageSize }) => ({
    items: unassigned.slice((page - 1) * pageSize, page * pageSize), total: unassigned.length
  }))
  api.getManagedFeedback.mockImplementation(async id => ({ ...ticket(id), workflowStage: 'UNASSIGNED', workArea: 'STAR' }))
  api.claimFeedback.mockImplementation(async id => {
    unassigned.splice(unassigned.findIndex(item => item.id === id), 1)
    return { ...ticket(id), workflowStage: 'PROCESSING', workArea: 'STAR', operatorAssigneeName: '测试运营' }
  })
  const wrapper = render(ManagedFeedback); await flushPromises()
  await wrapper.get('input[name="managed-feedback-search"]').setValue('待处理')
  await wrapper.get('form[role="search"]').trigger('submit'); await flushPromises()
  await wrapper.findAll('.feedback-filter select')[0].setValue('BUG'); await flushPromises()
  await wrapper.findAll('.feedback-filter select')[1].setValue('STAR'); await flushPromises()
  await wrapper.get('[aria-label="每页显示数量"]').setValue(String(pageSize)); await flushPromises()
  await wrapper.get('[aria-label="下一页"]').trigger('click'); await flushPromises()
  const ids = [`rpt_${pageSize}`, `rpt_${pageSize + 1}`]
  for (const id of ids) {
    await choose(wrapper, id)
    await wrapper.findAll('button').find(button => button.text() === '接单').trigger('click'); await flushPromises()
    expect(api.listWorkflowFeedback).toHaveBeenLastCalledWith(expect.objectContaining({
      queue: 'UNASSIGNED', page: 2, pageSize, q: '待处理', type: 'BUG', workArea: 'STAR'
    }))
    expect(wrapper.get('.ticket-detail-meta').text()).toContain('处理中')
    expect(wrapper.get('.ticket-detail-meta').text()).toContain('测试运营')
    expect(wrapper.findAll('.feedback-action-toolbar button').some(button => button.text() === '接单')).toBe(false)
    await close(wrapper)
  }
  expect(api.claimFeedback.mock.calls).toEqual(ids.map(id => [id]))
  expect(wrapper.get('.feedback-result-meta').text()).toContain(`当前筛选共 ${pageSize * 2 + 2} 条`)
  expect(wrapper.get('[aria-label="每页显示数量"]').element.value).toBe(String(pageSize))
  wrapper.unmount()
})

it.each([30, 50])('切换到每页 %i 条重置页码，保留筛选并更新分页区间', async pageSize => {
  const items = Array.from({ length: 105 }, (_, index) => summary(`rpt_${index}`))
  api.listWorkflowFeedback.mockImplementation(async ({ page, pageSize }) => ({
    items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length
  }))
  const wrapper = render(ManagedFeedback); await flushPromises()
  const selector = wrapper.get('[aria-label="每页显示数量"]')
  expect(selector.element.value).toBe('20')
  expect(selector.findAll('option').map(option => option.element.value)).toEqual(['20', '30', '50'])
  await wrapper.get('input[name="managed-feedback-search"]').setValue('待处理')
  await wrapper.get('form[role="search"]').trigger('submit'); await flushPromises()
  await wrapper.findAll('.feedback-filter select')[0].setValue('BUG'); await flushPromises()
  await wrapper.findAll('.feedback-filter select')[1].setValue('STAR'); await flushPromises()
  await wrapper.findAll('.feedback-status-tabs button').find(button => button.text().split(/\s+/)[0] === '我负责').trigger('click'); await flushPromises()
  await wrapper.get('[aria-label="下一页"]').trigger('click'); await flushPromises()
  await selector.setValue(String(pageSize)); await flushPromises()
  expect(api.listWorkflowFeedback).toHaveBeenLastCalledWith(expect.objectContaining({
    queue: 'MINE', page: 1, pageSize, q: '待处理', type: 'BUG', workArea: 'STAR'
  }))
  const pages = Math.ceil(105 / pageSize)
  expect(wrapper.get('.feedback-result-meta').text()).toContain(`第 1 / ${pages} 页`)
  expect(wrapper.get('.ticket-pagination').text()).toContain(`1-${pageSize} / 共 105 条`)
  expect(wrapper.findAll('tbody tr')).toHaveLength(pageSize)
  await wrapper.get('[aria-label="下一页"]').trigger('click'); await flushPromises()
  expect(api.listWorkflowFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2, pageSize }))
  expect(wrapper.get('.ticket-pagination').text()).toContain(`${pageSize + 1}-${pageSize * 2} / 共 105 条`)
  wrapper.unmount()
})

it.each([20, 0])('末页接单后剩余 %i 条时回退有效页码并保留详情', async remaining => {
  const unassigned = [...Array.from({ length: 20 }, (_, index) => summary(`rpt_${index}`)), summary('rpt_a')]
  api.listWorkflowFeedback.mockImplementation(async ({ page, pageSize }) => ({
    items: unassigned.slice((page - 1) * pageSize, page * pageSize), total: unassigned.length
  }))
  api.getManagedFeedback.mockResolvedValue({ ...ticket('rpt_a'), workflowStage: 'UNASSIGNED' })
  api.claimFeedback.mockImplementation(async () => {
    unassigned.length = remaining
    return { ...ticket('rpt_a'), workflowStage: 'PROCESSING', operatorAssigneeName: '测试运营' }
  })
  const wrapper = render(ManagedFeedback); await flushPromises()
  await wrapper.get('[aria-label="下一页"]').trigger('click'); await flushPromises()
  await choose(wrapper, 'rpt_a')
  await wrapper.findAll('button').find(button => button.text() === '接单').trigger('click'); await flushPromises()
  expect(api.listWorkflowFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ queue: 'UNASSIGNED', page: 1 }))
  expect(wrapper.get('.feedback-result-meta').text()).toContain(`当前筛选共 ${remaining} 条`)
  expect(wrapper.get('.feedback-result-meta').text()).toContain('第 1 / 1 页')
  expect(wrapper.get('.ticket-detail-meta').text()).toContain('测试运营')
  await close(wrapper)
  if (remaining) expect(wrapper.findAll('tbody tr')).toHaveLength(remaining)
  else expect(wrapper.get('.ticket-state.empty').text()).toContain('暂无符合条件的授权工单')
  wrapper.unmount()
})

it('转交运营从当前板块候选人中选择并提交用户 ID', async () => {
  api.getManagedFeedback.mockResolvedValue({ ...ticket('rpt_a'), workflowStage: 'PROCESSING', workArea: 'OPERATOR', operatorAssigneeUserId: 'tester', operatorAssigneeName: '当前运营' })
  api.listFeedbackAssignees.mockResolvedValue([{ id: 'next', userName: '下一位运营' }])
  api.assignFeedback.mockResolvedValue({ ...ticket('rpt_a'), workflowStage: 'PROCESSING', workArea: 'OPERATOR', operatorAssigneeUserId: 'next', operatorAssigneeName: '下一位运营' })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  expect(wrapper.get('.detail-action-area').text()).toContain('工单流转')
  expect(wrapper.find('.feedback-workflow-options').exists()).toBe(false)
  await wrapper.findAll('button').find(button => button.text() === '工单流转').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '转交运营').trigger('click')
  await flushPromises()
  expect(wrapper.get('.detail-action-area .feedback-workflow-form').exists()).toBe(true)
  expect(wrapper.find('.feedback-action-toolbar').exists()).toBe(false)
  expect(api.listFeedbackAssignees).toHaveBeenCalledWith('rpt_a')
  expect(wrapper.get('.feedback-workflow-form').text()).toContain('下一位运营')
  expect(wrapper.find('.feedback-workflow-form input').exists()).toBe(false)
  await wrapper.get('.feedback-workflow-form select').setValue('next')
  await wrapper.get('.feedback-workflow-form textarea').setValue('请接手')
  await wrapper.get('.feedback-workflow-form').trigger('submit')
  await flushPromises()
  expect(api.assignFeedback).toHaveBeenCalledWith('rpt_a', 'next', '请接手')
  wrapper.unmount()
})

it('取消流转表单后恢复底部操作，不同时显示回复表单', async () => {
  api.getManagedFeedback.mockResolvedValue({ ...ticket('rpt_a'), workflowStage: 'PROCESSING', workArea: 'OPERATOR' })
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  await wrapper.findAll('button').find(button => button.text() === '工单流转').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '调整板块').trigger('click')
  expect(wrapper.get('.detail-action-area .feedback-workflow-form').exists()).toBe(true)
  expect(wrapper.find('.feedback-reply-form').exists()).toBe(false)
  await wrapper.get('.feedback-workflow-form .feedback-button').trigger('click')
  expect(wrapper.find('.feedback-workflow-form').exists()).toBe(false)
  expect(wrapper.get('.feedback-action-toolbar').text()).toContain('回复')
  wrapper.unmount()
})

it('转交候选人加载失败时可重试，且旧工单结果不会进入新工单', async () => {
  const pending = deferred()
  api.getManagedFeedback.mockImplementation(async id => ({ ...ticket(id), workflowStage: 'PROCESSING', workArea: 'OPERATOR' }))
  api.listFeedbackAssignees.mockReturnValueOnce(pending.promise).mockRejectedValueOnce(new Error('加载失败')).mockResolvedValueOnce([{ id: 'next', userName: '可选运营' }])
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  await wrapper.findAll('button').find(button => button.text() === '工单流转').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '转交运营').trigger('click')
  await close(wrapper)
  await choose(wrapper, 'rpt_b')
  await wrapper.findAll('button').find(button => button.text() === '工单流转').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '转交运营').trigger('click')
  await flushPromises()
  pending.resolve([{ id: 'stale', userName: '旧工单运营' }]); await flushPromises()
  expect(wrapper.get('.feedback-workflow-form').text()).toContain('加载失败')
  expect(wrapper.get('.feedback-workflow-form').text()).not.toContain('旧工单运营')
  await wrapper.get('.feedback-workflow-error button').trigger('click')
  await flushPromises()
  expect(wrapper.get('.feedback-workflow-form').text()).toContain('可选运营')
  wrapper.unmount()
})

it('转程序沿用当前板块，调整板块走单独接口', async () => {
  const detail = { ...ticket('rpt_a'), workflowStage: 'PROCESSING', workArea: 'OPERATOR', operatorAssigneeUserId: 'tester' }
  api.getFeedbackAccess.mockResolvedValue({ super_admin: true, available_categories: [
    { key: 'OPERATOR', label: '密探养成' }, { key: 'INVENTORY', label: '仓库' }
  ] })
  api.getManagedFeedback.mockResolvedValue(detail)
  api.handoffFeedback.mockResolvedValue({ ...detail, workflowStage: 'DEV_HANDOFF' })
  api.changeFeedbackWorkArea.mockResolvedValue({ ...detail, workArea: 'INVENTORY' })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  await wrapper.findAll('button').find(button => button.text() === '工单流转').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '转程序').trigger('click')
  expect(wrapper.get('.feedback-workflow-form').text()).toContain('当前负责板块')
  expect(wrapper.find('.feedback-workflow-form select').exists()).toBe(false)
  await wrapper.get('.feedback-workflow-form textarea').setValue('需要程序处理')
  await wrapper.get('.feedback-workflow-form').trigger('submit')
  await flushPromises()
  expect(api.handoffFeedback).toHaveBeenCalledWith('rpt_a', 'OPERATOR', '需要程序处理')
  expect(api.listFeedbackWorkflowEvents).not.toHaveBeenCalled()
  expect(api.changeFeedbackWorkArea).not.toHaveBeenCalled()

  await close(wrapper)
  await choose(wrapper, 'rpt_a')
  await wrapper.findAll('button').find(button => button.text() === '工单流转').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '调整板块').trigger('click')
  await wrapper.get('.feedback-workflow-form select').setValue('INVENTORY')
  await wrapper.get('.feedback-workflow-form textarea').setValue('分类修正')
  await wrapper.get('.feedback-workflow-form').trigger('submit')
  await flushPromises()
  expect(api.changeFeedbackWorkArea).toHaveBeenCalledWith('rpt_a', 'INVENTORY', '分类修正')
  wrapper.unmount()
})

it('处理记录作为流转第四项打开弹窗时才查询，并显示中文动作', async () => {
  api.getManagedFeedback.mockResolvedValue({ ...ticket('rpt_a'), workflowStage: 'PROCESSING', workArea: 'OPERATOR' })
  api.listFeedbackWorkflowEvents.mockResolvedValue([{ id: 'event_1', action: 'CLAIM', actorUserId: '', note: '接单', createdAt: '2026-09-28T00:00:00Z' }])
  const wrapper = render(ManagedFeedback, { attachTo: document.body }); await flushPromises()
  await choose(wrapper, 'rpt_a')
  expect(api.listFeedbackWorkflowEvents).not.toHaveBeenCalled()
  expect(wrapper.find('[aria-label="工单流转"]').exists()).toBe(false)
  await wrapper.findAll('button').find(button => button.text() === '工单流转').trigger('click')
  expect(wrapper.get('.feedback-workflow-options').findAll('button').map(button => button.text())).toEqual(['转交运营', '转程序', '调整板块', '处理记录'])
  await wrapper.findAll('button').find(button => button.text() === '处理记录').trigger('click')
  await flushPromises()
  expect(api.listFeedbackWorkflowEvents).toHaveBeenCalledWith('rpt_a')
  expect(wrapper.get('.feedback-history-dialog').text()).toContain('接单')
  expect(wrapper.get('.feedback-history-dialog').text()).not.toContain('CLAIM')
  expect(wrapper.get('.feedback-history-dialog').text()).not.toContain('· ·')
  await wrapper.get('.feedback-history-dialog').trigger('keydown', { key: 'Escape' }); await flushPromises()
  expect(wrapper.find('.feedback-history-dialog').exists()).toBe(false)
  expect(wrapper.find('.ticket-detail-dialog').exists()).toBe(true)
  expect(document.activeElement?.textContent).toContain('工单流转')
  wrapper.unmount()
})

it('处理记录加载失败可重试，旧工单结果不会进入新工单', async () => {
  const pending = deferred()
  api.getManagedFeedback.mockImplementation(async id => ({ ...ticket(id), workflowStage: 'PROCESSING' }))
  api.listFeedbackWorkflowEvents.mockRejectedValueOnce(new Error('加载失败'))
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce([{ id: 'event_b', action: 'HANDOFF', note: 'B 的记录' }])
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  await wrapper.findAll('button').find(button => button.text() === '工单流转').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '处理记录').trigger('click'); await flushPromises()
  expect(wrapper.get('.feedback-history-dialog').text()).toContain('加载失败')
  await wrapper.get('.feedback-history-dialog .feedback-workflow-error button').trigger('click')
  await wrapper.get('[aria-label="关闭处理记录"]').trigger('click')
  await close(wrapper)
  await choose(wrapper, 'rpt_b')
  await wrapper.findAll('button').find(button => button.text() === '工单流转').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '处理记录').trigger('click'); await flushPromises()
  pending.resolve([{ id: 'event_a', action: 'CLAIM', note: 'A 的记录' }]); await flushPromises()
  expect(wrapper.get('.feedback-history-dialog').text()).toContain('B 的记录')
  expect(wrapper.get('.feedback-history-dialog').text()).not.toContain('A 的记录')
  wrapper.unmount()
})

it('管理操作从底部打开反馈广场弹窗，保存后更新详情状态', async () => {
  const detail = { ...ticket('rpt_a'), workflowStage: 'PROCESSING', title: '原始标题', publicConsent: true, visibility: 'PRIVATE' }
  api.getManagedFeedback.mockResolvedValue(detail)
  api.publishFeedback.mockResolvedValue({ ...detail, visibility: 'PUBLIC', publicTitle: '公开标题' })
  const wrapper = render(ManagedFeedback, { attachTo: document.body }); await flushPromises()
  await choose(wrapper, 'rpt_a')
  expect(wrapper.find('.feedback-admin-settings-collapsible').exists()).toBe(false)
  expect(wrapper.get('.feedback-management-summary').text()).toContain('广场进度：未发布')
  await wrapper.findAll('.feedback-action-toolbar button').find(button => button.text() === '管理操作').trigger('click')
  expect(wrapper.get('[aria-label="管理操作选项"]').findAll('button').map(button => button.text())).toEqual(['反馈广场', '合并反馈'])
  await wrapper.get('[aria-label="管理操作选项"]').findAll('button')[0].trigger('click')
  await flushPromises()
  expect(wrapper.get('.feedback-management-dialog').text()).toContain('公开标题')
  expect(wrapper.find('.admin-public-trigger').exists()).toBe(false)
  await wrapper.get('.feedback-management-dialog input').setValue('公开标题')
  await wrapper.get('.admin-public-actions button').trigger('click')
  await flushPromises()
  expect(api.publishFeedback).toHaveBeenCalledWith('rpt_a', expect.objectContaining({ publicTitle: '公开标题' }))
  expect(wrapper.get('.feedback-management-summary').text()).toContain('广场进度：已发布')
  await wrapper.get('[aria-label="关闭管理弹窗"]').trigger('click'); await flushPromises()
  expect(wrapper.find('.feedback-management-dialog').exists()).toBe(false)
  expect(document.activeElement?.textContent).toContain('管理操作')
  wrapper.unmount()
})

it('管理员详情隐藏关联版本入口与摘要，也不加载版本列表', async () => {
  const detail = { ...ticket('rpt_a'), workflowStage: 'PROCESSING', targetVersionLabel: '1.0', completedVersionLabel: '1.1' }
  api.getManagedFeedback.mockResolvedValue(detail)
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  expect(wrapper.find('.feedback-management-summary').text()).not.toContain('版本')
  await wrapper.findAll('.feedback-action-toolbar button').find(button => button.text() === '管理操作').trigger('click')
  expect(wrapper.get('[aria-label="管理操作选项"]').text()).not.toContain('关联版本')
  expect(api.listFeedbackVersionOptions).not.toHaveBeenCalled()
  expect(api.updateFeedbackVersions).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('已结束工单保留反馈广场和重新打开，隐藏合并与其他处理按钮', async () => {
  api.getManagedFeedback.mockResolvedValue({ ...ticket('rpt_a'), status: 'RESOLVED', workflowStage: 'PROCESSING' })
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  const actions = wrapper.get('.detail-action-area').text()
  expect(actions).toContain('重新打开')
  expect(actions).toContain('管理操作')
  expect(actions).not.toContain('回复')
  expect(actions).not.toContain('工单流转')
  expect(actions).not.toContain('驳回')
  await wrapper.findAll('.feedback-action-toolbar button').find(button => button.text() === '管理操作').trigger('click')
  expect(wrapper.get('[aria-label="管理操作选项"]').findAll('button').map(button => button.text())).toEqual(['反馈广场'])
  wrapper.unmount()
})

it('活动工单的合并入口复用原弹窗，已有子反馈时隐藏入口', async () => {
  api.getManagedFeedback.mockResolvedValueOnce({ ...ticket('rpt_a'), workflowStage: 'PROCESSING' })
    .mockResolvedValueOnce({ ...ticket('rpt_b'), workflowStage: 'PROCESSING', mergedCount: 2 })
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  await wrapper.findAll('.feedback-action-toolbar button').find(button => button.text() === '管理操作').trigger('click')
  await wrapper.get('[aria-label="管理操作选项"]').findAll('button')[1].trigger('click'); await flushPromises()
  expect(wrapper.get('.merge-dialog').text()).toContain('合并反馈')
  await wrapper.get('.merge-dialog [aria-label="关闭"]').trigger('click')
  await close(wrapper)
  await choose(wrapper, 'rpt_b')
  await wrapper.findAll('.feedback-action-toolbar button').find(button => button.text() === '管理操作').trigger('click')
  expect(wrapper.get('[aria-label="管理操作选项"]').findAll('button').map(button => button.text())).toEqual(['反馈广场'])
  wrapper.unmount()
})

it('程序岗只能填写内部结果并交回，不能回复用户', async () => {
  api.getFeedbackAccess.mockResolvedValue({ developer_areas: ['STAR'], available_categories: [{ key: 'STAR', label: '星石' }] })
  api.getManagedFeedback.mockResolvedValue({ ...ticket('rpt_a'), workArea: 'STAR', workflowStage: 'DEV_HANDOFF', viewerCanManage: false, viewerCanDevelop: true })
  api.returnFeedback.mockResolvedValue({ ...ticket('rpt_a'), workArea: 'STAR', workflowStage: 'PROCESSING', viewerCanManage: false, viewerCanDevelop: false })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  expect(wrapper.get('[role="dialog"]').text()).not.toContain('发送回复')
  expect(wrapper.findAll('.feedback-action-toolbar button').some(button => button.text() === '管理操作')).toBe(false)
  expect(wrapper.get('.detail-action-area').text()).toContain('填写结果并交回')
  await wrapper.findAll('button').find(button => button.text() === '工单流转').trigger('click')
  expect(wrapper.get('.feedback-workflow-options').findAll('button').map(button => button.text())).toEqual(['处理记录'])
  await wrapper.findAll('button').find(button => button.text() === '工单流转').trigger('click')
  await wrapper.findAll('button').find(button => button.text() === '填写结果并交回').trigger('click')
  await wrapper.get('.feedback-workflow-form textarea').setValue('已修复并验证')
  await wrapper.get('.feedback-workflow-form').trigger('submit')
  await flushPromises()
  expect(api.returnFeedback).toHaveBeenCalledWith('rpt_a', '已修复并验证', 'RETURN')
  wrapper.unmount()
})

describe.each([
  ['personal', MyFeedback, 'appendMyFeedbackMessage'],
  ['managed', ManagedFeedback, 'appendManagedFeedbackMessage']
])('%s feedback detail isolation', (mode, component, appendName) => {
  const detailApi = mode === 'managed' ? api.getManagedFeedback : api.getFeedback
  it('opens a notification-linked ticket outside the current page without adding it to the list', async () => {
    useRoute().query = { id: 'rpt_off_page' }
    const wrapper = render(component); await flushPromises()
    expect(detailApi).toHaveBeenCalledWith('rpt_off_page')
    expect(wrapper.get('[role="dialog"]').text()).toContain('conversation rpt_off_page')
    expect(wrapper.findAll('tbody tr')).toHaveLength(2)
  })

  it('shows an off-page deep-link failure instead of silently doing nothing', async () => {
    useRoute().query = { id: 'rpt_missing' }
    detailApi.mockRejectedValue(new Error('工单不存在'))
    const wrapper = render(component); await flushPromises()
    expect(wrapper.get('[role="dialog"] [role="alert"]').text()).toContain('工单不存在')
    expect(markFeedbackNotificationsRead).not.toHaveBeenCalled()
  })

  it('closing a loading detail prevents late completion from reopening it or marking it read', async () => {
    const pending = deferred()
    detailApi.mockReturnValue(pending.promise)
    const wrapper = render(component); await flushPromises()
    await choose(wrapper, 'rpt_a'); await close(wrapper)
    pending.resolve(ticket('rpt_a')); await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(markFeedbackNotificationsRead).not.toHaveBeenCalled()
  })

  it('a slower A detail cannot replace the selected B detail', async () => {
    const pending = deferred()
    detailApi.mockImplementation(id => id === 'rpt_a' ? pending.promise : Promise.resolve(ticket(id)))
    const wrapper = render(component); await flushPromises()
    await choose(wrapper, 'rpt_a'); await close(wrapper); await choose(wrapper, 'rpt_b')
    pending.resolve(ticket('rpt_a')); await flushPromises()
    expect(wrapper.get('[role="dialog"]').text()).toContain('conversation rpt_b')
    expect(wrapper.get('[role="dialog"]').text()).not.toContain('conversation rpt_a')
  })

  it('reopens with fresh messages and follows notification query changes on the mounted page', async () => {
    const wrapper = render(component); await flushPromises()
    await choose(wrapper, 'rpt_a'); await close(wrapper); await choose(wrapper, 'rpt_a')
    expect(detailApi.mock.calls.filter(([id]) => id === 'rpt_a')).toHaveLength(2)
    useRoute().query = { id: 'rpt_b' }; await flushPromises()
    expect(wrapper.get('[role="dialog"]').text()).toContain('conversation rpt_b')
  })

  it('late reply success cannot replace another ticket or clear its draft', async () => {
    const pending = deferred()
    api[appendName].mockReturnValue(pending.promise)
    const wrapper = render(component); await flushPromises()
    await choose(wrapper, 'rpt_a'); await compose(wrapper, 'reply to A')
    await wrapper.get('.feedback-reply-form .feedback-primary-action').trigger('click'); await flushPromises()
    expect(api[appendName]).toHaveBeenCalledWith('rpt_a', { content: 'reply to A', mediaIds: [] })
    await close(wrapper); await choose(wrapper, 'rpt_b'); await compose(wrapper, 'unsent B draft')
    pending.resolve(ticket('rpt_a')); await flushPromises()
    expect(wrapper.get('[role="dialog"]').text()).toContain('conversation rpt_b')
    expect(wrapper.get('.feedback-reply-form textarea').element.value).toBe('unsent B draft')
  })

  it('late status success cannot close another ticket or discard its draft', async () => {
    const pending = deferred()
    const update = mode === 'personal' ? api.updateMyFeedbackStatus : api.updateManagedFeedbackStatus
    update.mockReturnValue(pending.promise)
    if (mode === 'managed') {
      detailApi.mockImplementation(async id => ({ ...ticket(id), workflowStage: 'PROCESSING' }))
      vi.spyOn(window, 'confirm').mockReturnValue(true)
    }
    const wrapper = render(component); await flushPromises()
    await choose(wrapper, 'rpt_a')
    const done = wrapper.findAll('.feedback-detail-actions button').find(button => button.text().includes('标记完成'))
    await done.trigger('click'); await flushPromises()
    expect(update).toHaveBeenCalledWith('rpt_a', 'RESOLVED', ...(mode === 'managed' ? [null] : []))
    await close(wrapper); await choose(wrapper, 'rpt_b'); await compose(wrapper, 'B remains open')
    pending.resolve({ ...ticket('rpt_a'), status: 'RESOLVED' }); await flushPromises()
    expect(wrapper.get('[role="dialog"]').text()).toContain('conversation rpt_b')
    expect(wrapper.get('.feedback-reply-form textarea').element.value).toBe('B remains open')
  })

  it('failed replies preserve content and uploaded attachments for a retry', async () => {
    api[appendName].mockRejectedValueOnce(new Error('网络暂时不可用')).mockResolvedValueOnce(ticket('rpt_a'))
    uploadMedia.mockResolvedValue({ id: 'med_retry' })
    const wrapper = render(component); await flushPromises()
    await choose(wrapper, 'rpt_a'); await compose(wrapper, 'retry this message')
    expect(wrapper.get('.feedback-reply-form textarea').attributes('maxlength')).toBe('1000')
    wrapper.findComponent(FeedbackAttachmentPicker).props('media').addFiles([new File(['sample'], 'sample.log', { type: 'text/plain' })])
    await wrapper.get('.feedback-reply-form .feedback-primary-action').trigger('click'); await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('网络暂时不可用')
    expect(wrapper.get('.feedback-reply-form textarea').element.value).toBe('retry this message')
    await wrapper.get('.feedback-reply-form .feedback-primary-action').trigger('click'); await flushPromises()
    expect(uploadMedia).toHaveBeenCalledTimes(1)
    expect(api[appendName]).toHaveBeenCalledTimes(2)
    expect(api[appendName]).toHaveBeenLastCalledWith('rpt_a', { content: 'retry this message', mediaIds: ['med_retry'] })
    expect(wrapper.find('.feedback-reply-form').exists()).toBe(false)
  })

  it('closing during attachment upload prevents the canceled reply from being sent', async () => {
    const upload = deferred()
    uploadMedia.mockReturnValue(upload.promise)
    const wrapper = render(component); await flushPromises()
    await choose(wrapper, 'rpt_a'); await compose(wrapper, 'canceled reply')
    const picker = wrapper.findComponent(FeedbackAttachmentPicker)
    picker.props('media').addFiles([new File(['sample'], 'sample.log', { type: 'text/plain' })])
    await wrapper.get('.feedback-reply-form .feedback-primary-action').trigger('click'); await flushPromises()
    await close(wrapper)
    upload.resolve({ id: 'med_synthetic' }); await flushPromises()
    expect(api[appendName]).not.toHaveBeenCalled()
  })
})

it('management unmount during permission loading cannot start a late poll or list request', async () => {
  vi.useFakeTimers()
  const pending = deferred()
  api.getFeedbackAccess.mockReturnValue(pending.promise)
  const wrapper = render(ManagedFeedback)
  wrapper.unmount()
  pending.resolve({ super_admin: true }); await flushPromises()
  expect(api.listWorkflowFeedback).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('management background refresh cannot supersede a foreground load and leave loading stuck', async () => {
  vi.useFakeTimers()
  const wrapper = render(ManagedFeedback); await flushPromises()
  const pending = deferred()
  api.listWorkflowFeedback.mockReturnValue(pending.promise)
  await wrapper.get('form[role="search"]').trigger('submit'); await flushPromises()
  await vi.advanceTimersByTimeAsync(30000)
  expect(api.listWorkflowFeedback).toHaveBeenCalledTimes(2)
  pending.resolve({ items: [summary('rpt_b')], total: 1 }); await flushPromises()
  expect(wrapper.find('.ticket-state[role="status"]').exists()).toBe(false)
  expect(wrapper.findAll('tbody tr')).toHaveLength(1)
})

it('creating feedback prevents duplicate submit, clears stale filters and opens the created ticket', async () => {
  const pending = deferred()
  api.createFeedback.mockReturnValue(pending.promise)
  const wrapper = render(MyFeedback); await flushPromises()
  await wrapper.get('input[name="feedback-search"]').setValue('old filter')
  await wrapper.get('form[role="search"]').trigger('submit'); await flushPromises()
  await wrapper.get('.feedback-hero-action').trigger('click')
  const form = wrapper.get('.feedback-modal form')
  await form.findAll('select')[1].setValue('OPERATOR')
  await form.get('[name="public-consent"]').setValue(true)
  await form.get('input[maxlength="120"]').setValue('新问题')
  await form.get('textarea').setValue('new issue')
  await form.trigger('submit'); await form.trigger('submit'); await flushPromises()
  expect(api.createFeedback).toHaveBeenCalledTimes(1)
  expect(api.createFeedback).toHaveBeenCalledWith(expect.objectContaining({ content: 'new issue', category: 'OPERATOR' }))
  pending.resolve(ticket('rpt_new')); await flushPromises()
  expect(api.listMyFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1, q: undefined, type: undefined, category: undefined }))
  expect(wrapper.get('[role="dialog"]').text()).toContain('conversation rpt_new')
  expect(wrapper.findAll('tbody tr')).toHaveLength(2)
})

it('用户和管理员从后端目录看到相同板块，用户可提交星石反馈', async () => {
  const mine = render(MyFeedback); await flushPromises()
  await mine.get('.feedback-hero-action').trigger('click')
  const options = mine.findAll('.feedback-modal select')[1].findAll('option').map(option => option.text())
  expect(options).toEqual(['请选择反馈板块', '密探养成', '星石', '麻圆'])
  await mine.findAll('.feedback-modal select')[1].setValue('STAR')
  await mine.get('[name="public-consent"]').setValue(true)
  await mine.get('input[maxlength="120"]').setValue('星石异常')
  await mine.get('.feedback-modal textarea').setValue('星石无法保存')
  api.createFeedback.mockResolvedValue(ticket('rpt_new'))
  await mine.get('.feedback-modal form').trigger('submit'); await flushPromises()
  expect(api.createFeedback).toHaveBeenCalledWith(expect.objectContaining({ category: 'STAR' }))

  const managed = render(ManagedFeedback); await flushPromises()
  expect(managed.findAll('.feedback-filter-row select')[1].findAll('option').map(option => option.text())).toEqual(['全部板块', '密探养成', '星石', '麻圆'])
  mine.unmount(); managed.unmount()
})

it('板块目录加载失败时不给出过期选项也不能提交', async () => {
  api.getFeedbackAccess.mockRejectedValue(new Error('offline'))
  const wrapper = render(MyFeedback); await flushPromises()
  await wrapper.get('.feedback-hero-action').trigger('click')
  expect(wrapper.findAll('.feedback-modal select')[1].findAll('option').map(option => option.text())).toEqual(['反馈板块加载失败'])
  expect(wrapper.get('.feedback-modal button[type="submit"]').attributes('disabled')).toBeDefined()
  expect(wrapper.get('.feedback-modal [role="alert"]').text()).toContain('反馈板块加载失败')
  wrapper.unmount()
})

it('完成反馈须确认，成功后切到已完成列表并告知去向', async () => {
  const wrapper = render(MyFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.findAll('.feedback-detail-actions button').find(button => button.text().includes('标记完成')).trigger('click')
  await flushPromises()
  expect(api.updateMyFeedbackStatus).not.toHaveBeenCalled()
  await wrapper.findAll('.feedback-detail-actions button').find(button => button.text().includes('标记完成')).trigger('click')
  await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '确认问题已解决？' }))
  expect(api.updateMyFeedbackStatus).toHaveBeenCalledWith('rpt_a', 'RESOLVED')
  expect(wrapper.get('.feedback-public-notice').text()).toContain('已完成')
  expect(wrapper.findAll('[role="tab"]').find(tab => tab.text() === '已完成').attributes('aria-selected')).toBe('true')
})

it('弹窗关闭、遮罩和 Esc 对文字与附件草稿使用同一放弃确认', async () => {
  const wrapper = render(MyFeedback); await flushPromises()
  await wrapper.get('.feedback-hero-action').trigger('click')
  await wrapper.get('[name="public-consent"]').setValue(true)
  await wrapper.get('.feedback-modal input[maxlength="120"]').setValue('草稿标题')
  await wrapper.get('.feedback-modal textarea').setValue('草稿正文')
  await wrapper.findComponent(FeedbackAttachmentPicker).props('media').addFiles([new File(['log'], 'draft.log', { type: 'text/plain' })])
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('[aria-label="关闭提交反馈弹窗"]').trigger('click'); await flushPromises()
  expect(wrapper.get('.feedback-modal input[maxlength="120"]').element.value).toBe('草稿标题')
  expect(wrapper.get('.feedback-modal .feedback-attachment-item').exists()).toBe(true)
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.get('.modal-mask').trigger('click'); await flushPromises()
  expect(wrapper.get('.feedback-modal textarea').element.value).toBe('草稿正文')
  await wrapper.get('.feedback-modal').trigger('keydown', { key: 'Escape' }); await flushPromises()
  expect(wrapper.find('.feedback-modal').exists()).toBe(false)
  await wrapper.get('.feedback-hero-action').trigger('click')
  expect(wrapper.find('.feedback-modal input[maxlength="120"]').exists()).toBe(false)
  await wrapper.get('[name="public-consent"]').setValue(true)
  expect(wrapper.get('.feedback-modal input[maxlength="120"]').element.value).toBe('')
  expect(wrapper.find('.feedback-modal .feedback-attachment-item').exists()).toBe(false)
})

it('默认私下提交不需要标题，公开授权与客户端信息同意独立', async () => {
  api.createFeedback.mockResolvedValue(ticket('rpt_new'))
  const wrapper = render(MyFeedback); await flushPromises()
  await wrapper.get('.feedback-hero-action').trigger('click')
  const form = wrapper.get('.feedback-modal form')
  expect(form.get('[name="public-consent"]').element.checked).toBe(false)
  expect(form.find('input[maxlength="120"]').exists()).toBe(false)
  expect(wrapper.findComponent(SimilarFeedbackList).exists()).toBe(false)
  await form.findAll('select')[1].setValue('OPERATOR')
  await form.get('textarea').setValue('仅私下沟通')
  await form.get('input[type="checkbox"]:not([name="public-consent"])').setValue(true)
  await form.trigger('submit'); await flushPromises()
  expect(api.createFeedback).toHaveBeenCalledWith(expect.objectContaining({ content: '仅私下沟通', title: '', publicConsent: false, clientInfoConsent: true }))
  expect(findSimilarFeedback).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('取消公开授权保留隐藏标题但不提交，并忽略迟到的相似检索', async () => {
  const wrapper = render(MyFeedback); await flushPromises()
  await wrapper.get('.feedback-hero-action').trigger('click')
  const form = wrapper.get('.feedback-modal form')
  const pending = deferred()
  findSimilarFeedback.mockReturnValueOnce(pending.promise)
  vi.useFakeTimers()
  try {
    await form.findAll('select')[1].setValue('OPERATOR')
    await form.get('[name="public-consent"]').setValue(true)
    await form.get('input[maxlength="120"]').setValue('草稿标题')
    await vi.advanceTimersByTimeAsync(350)
    expect(findSimilarFeedback).toHaveBeenCalledTimes(1)
    await form.get('[name="public-consent"]').setValue(false)
    pending.resolve([{ id: 'late', publicTitle: '迟到结果' }]); await flushPromises()
    await vi.advanceTimersByTimeAsync(350)
    expect(findSimilarFeedback).toHaveBeenCalledTimes(1)
    expect(wrapper.findComponent(SimilarFeedbackList).exists()).toBe(false)
    await form.get('[name="public-consent"]').setValue(true)
    expect(form.get('input[maxlength="120"]').element.value).toBe('草稿标题')
    expect(wrapper.findComponent(SimilarFeedbackList).props('items')).toEqual([])
    await form.get('[name="public-consent"]').setValue(false)
    await form.get('textarea').setValue('保持私下')
    api.createFeedback.mockResolvedValue(ticket('rpt_new'))
    await form.trigger('submit'); await flushPromises()
    expect(api.createFeedback).toHaveBeenCalledWith(expect.objectContaining({ title: '', publicConsent: false, content: '保持私下' }))
  } finally {
    wrapper.unmount()
    vi.useRealTimers()
  }
})

it('公开发布面板缺少明确用户授权时禁止保存但允许取消已有公开', async () => {
  for (const publicConsent of [undefined, false, 'true']) {
    const panel = mount(AdminFeedbackPublishPanel, {
      props: { item: { id: 'rpt_legacy', visibility: 'PUBLIC', publicTitle: '旧公开标题', publicConsent }, dialog: true, formatDate: value => value }
    })
    expect(panel.text()).toContain('用户未授权')
    expect(panel.get('.feedback-primary-action').attributes('disabled')).toBeDefined()
    await panel.get('.feedback-primary-action').trigger('click')
    expect(panel.emitted('save')).toBeUndefined()
    await panel.get('.feedback-button').trigger('click')
    expect(panel.emitted('unpublish')).toHaveLength(1)
    await panel.setProps({ item: { id: 'rpt_legacy', visibility: 'PUBLIC', publicTitle: '旧公开标题', publicConsent: true } })
    await panel.get('.feedback-primary-action').trigger('click')
    expect(panel.emitted('save')).toHaveLength(1)
    panel.unmount()
  }
})

it('管理员页面拒绝未授权发布事件且不修改反馈类型', async () => {
  api.getManagedFeedback.mockResolvedValue({ ...ticket('rpt_a'), workflowStage: 'PROCESSING', visibility: 'PRIVATE' })
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  await wrapper.findAll('.feedback-action-toolbar button').find(button => button.text() === '管理操作').trigger('click')
  await wrapper.get('[aria-label="管理操作选项"]').findAll('button')[0].trigger('click'); await flushPromises()
  wrapper.findComponent(AdminFeedbackPublishPanel).vm.$emit('save', { publicTitle: '标题', type: 'FEATURE' })
  await flushPromises()
  expect(api.publishFeedback).not.toHaveBeenCalled()
  expect(api.updateFeedbackType).not.toHaveBeenCalled()
  expect(wrapper.get('.admin-public-error').text()).toContain('用户未授权')
  wrapper.unmount()
})

it('允许公开时空标题在附件上传与创建请求之前拦截', async () => {
  const wrapper = render(MyFeedback); await flushPromises()
  await wrapper.get('.feedback-hero-action').trigger('click')
  const form = wrapper.get('.feedback-modal form')
  await form.findAll('select')[1].setValue('OPERATOR')
  await form.get('[name="public-consent"]').setValue(true)
  await form.get('input[maxlength="120"]').setValue('   ')
  await form.get('textarea').setValue('具体问题')
  expect(wrapper.get('.feedback-modal textarea').element.value).toBe('具体问题')
  await form.trigger('submit'); await flushPromises()
  expect(wrapper.get('.feedback-modal .feedback-form-error').text()).toContain('请填写标题')
  expect(uploadMedia).not.toHaveBeenCalled()
  expect(api.createFeedback).not.toHaveBeenCalled()
})

it('personal quota exhaustion explains why supplementing is unavailable without removing the close action', async () => {
  api.getFeedback.mockResolvedValue({ ...ticket('rpt_a'), quota: { canAppend: false, pendingCount: 3, pendingLimit: 3 } })
  const wrapper = render(MyFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  expect(wrapper.get('[role="dialog"]').text()).toContain('请等待管理员回复后继续补充')
  expect(wrapper.findAll('.feedback-detail-actions button').map(button => button.text())).toEqual(['问题已解决 · 标记完成'])
})

it('escape inside the nested merge dialog closes only the merge dialog', async () => {
  // 焦点栈在 document 捕获键盘事件，真实挂载后验证二级弹窗的事件路径。
  api.getManagedFeedback.mockResolvedValue({ ...ticket('rpt_a'), workflowStage: 'PROCESSING' })
  const wrapper = render(ManagedFeedback, { attachTo: document.body }); await flushPromises()
  await choose(wrapper, 'rpt_a')
  await wrapper.findAll('.feedback-action-toolbar button').find(button => button.text() === '管理操作').trigger('click')
  await wrapper.get('[aria-label="管理操作选项"]').findAll('button')[1].trigger('click'); await flushPromises()
  const merge = wrapper.get('.merge-dialog')
  expect(merge.exists()).toBe(true)

  merge.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flushPromises()

  // 合并反馈是压在工单详情之上的二级弹窗，Escape 只能关闭最上层。
  expect(wrapper.find('.merge-dialog').exists()).toBe(false)
  expect(wrapper.find('.ticket-detail-dialog').exists()).toBe(true)
})


it('首次无反馈提供提交入口，筛选无结果可以恢复全部', async () => {
  api.listMyFeedback.mockResolvedValue({ items: [], total: 0 })
  const wrapper = render(MyFeedback); await flushPromises()
  expect(wrapper.get('.ticket-state.empty').text()).toContain('还没有提交过反馈')
  await wrapper.get('.ticket-state.empty button').trigger('click')
  expect(wrapper.find('.feedback-modal').exists()).toBe(true)
  await wrapper.get('[aria-label="关闭提交反馈弹窗"]').trigger('click'); await flushPromises()
  await wrapper.get('input[name="feedback-search"]').setValue('没有匹配')
  await wrapper.get('form[role="search"]').trigger('submit'); await flushPromises()
  expect(wrapper.get('.ticket-state.empty').text()).toContain('没有找到符合条件')
  await wrapper.get('.ticket-state.empty button').trigger('click'); await flushPromises()
  expect(api.listMyFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ q: undefined, status: undefined, page: 1 }))
  wrapper.unmount()
})

it('支持相似反馈保留已填写草稿，详情使用安全的新标签页链接', async () => {
  const wrapper = render(MyFeedback); await flushPromises()
  await wrapper.get('.feedback-hero-action').trigger('click')
  await wrapper.get('.feedback-modal textarea').setValue('我遇到的不同细节')
  await wrapper.get('[name="public-consent"]').setValue(true)
  const similar = wrapper.findComponent(SimilarFeedbackList)
  similar.vm.$emit('support', { id: 'public-example', supportCount: 2 })
  await flushPromises()
  expect(wrapper.get('.feedback-modal textarea').element.value).toBe('我遇到的不同细节')
  expect(wrapper.get('.feedback-modal').text()).toContain('草稿已保留')
  expect(api.createFeedback).not.toHaveBeenCalled()
  wrapper.unmount()
  const list = mount(SimilarFeedbackList, {
    props: { items: [{ id: 'example/one', publicTitle: '公开问题', type: 'BUG' }] },
    global: { stubs: { FeedbackSupportButton: true } }
  })
  expect(list.get('a').attributes()).toMatchObject({ href: '/feedback/plaza?feedback=example%2Fone', target: '_blank', rel: 'noopener noreferrer' })
  list.unmount()
})

it('新建反馈限制键盘焦点并在关闭后返回入口', async () => {
  const wrapper = render(MyFeedback, { attachTo: document.body }); await flushPromises()
  const opener = wrapper.get('.feedback-hero-action').element
  opener.focus()
  await wrapper.get('.feedback-hero-action').trigger('click'); await flushPromises()
  const panel = wrapper.get('.feedback-modal').element
  expect(panel.contains(document.activeElement)).toBe(true)
  const last = panel.querySelector('button[type="submit"]')
  last.focus()
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))
  expect(panel.contains(document.activeElement)).toBe(true)
  expect(document.activeElement).not.toBe(last)
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flushPromises()
  expect(wrapper.find('.feedback-modal').exists()).toBe(false)
  expect(document.activeElement).toBe(opener)
  wrapper.unmount()
})
