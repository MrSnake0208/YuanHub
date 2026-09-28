import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { useRoute } from 'vue-router'
import MyFeedback from '../src/pages/feedback/index.vue'
import ManagedFeedback from '../src/pages/feedback/manage.vue'
import FeedbackAttachmentPicker from '../src/components/feedback/FeedbackAttachmentPicker.vue'
import * as api from '../src/api/feedback.js'
import { markFeedbackNotificationsRead } from '../src/api/notifications.js'
import { uploadMedia } from '../src/api/media.js'
import { dialog } from '../src/utils/dialog.js'

vi.mock('vue-router', async () => {
  const { reactive } = await import('vue')
  const route = reactive({ query: {} })
  return { useRoute: () => route, useRouter: () => ({ replace: vi.fn() }), onBeforeRouteLeave: vi.fn(), onBeforeRouteUpdate: vi.fn() }
})
vi.mock('../src/utils/dialog.js', () => ({ dialog: { confirm: vi.fn() } }))
vi.mock('../src/api/feedback.js', () => ({
  getFeedback: vi.fn(), getManagedFeedback: vi.fn(), getFeedbackAccess: vi.fn(), listMyFeedback: vi.fn(), listManagedFeedback: vi.fn(), listWorkflowFeedback: vi.fn(), listFeedbackWorkflowEvents: vi.fn(),
  claimFeedback: vi.fn(), assignFeedback: vi.fn(), handoffFeedback: vi.fn(), returnFeedback: vi.fn(),
  createFeedback: vi.fn(), appendMyFeedbackMessage: vi.fn(), appendManagedFeedbackMessage: vi.fn(),
  updateMyFeedbackStatus: vi.fn(), updateManagedFeedbackStatus: vi.fn(), downloadFeedbackAttachment: vi.fn(),
  mergeFeedback: vi.fn(),
  listFeedbackVersionOptions: vi.fn(() => Promise.resolve([]))
}))
vi.mock('../src/api/notifications.js', () => ({
  listUnreadNotifications: vi.fn().mockResolvedValue([]),
  getUnreadFeedbackNotificationRefs: () => [],
  markFeedbackNotificationsRead: vi.fn().mockResolvedValue([])
}))
vi.mock('../src/api/media.js', () => ({ uploadMedia: vi.fn() }))
vi.mock('../src/api/changelog.js', () => ({
  // restoreMocks 会重置 mockResolvedValue,因此用默认实现保证版本选择器不触发真实请求。
  listChangelog: vi.fn(() => Promise.resolve({ data: [], page: 1, total: 0, hasNext: false }))
}))
vi.mock('../src/store/auth.js', () => ({ auth: { userInfo: { id: 'tester' }, adminAccess: { superAdmin: true, permissions: [] } } }))
vi.mock('../src/store/feedbackUnread.js', () => ({
  feedbackUnreadState: { ids: [], count: 0 }, subscribeFeedbackUnread: () => () => {}, refreshFeedbackUnread: vi.fn()
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
  useRoute().query = {}
  api.getFeedbackAccess.mockReset().mockResolvedValue({ super_admin: true, available_areas: [] })
  api.getFeedback.mockReset().mockImplementation(async id => ticket(id))
  api.getManagedFeedback.mockReset().mockImplementation(async id => ticket(id))
  const list = { items: [summary('rpt_a'), summary('rpt_b')], total: 40 }
  api.listMyFeedback.mockReset().mockResolvedValue(list)
  api.listManagedFeedback.mockReset().mockResolvedValue(list)
  api.listWorkflowFeedback.mockReset().mockResolvedValue(list)
  api.listFeedbackWorkflowEvents.mockReset().mockResolvedValue([])
  api.appendMyFeedbackMessage.mockReset()
  api.appendManagedFeedbackMessage.mockReset()
  api.createFeedback.mockReset()
  api.updateMyFeedbackStatus.mockReset()
  api.updateManagedFeedbackStatus.mockReset()
  uploadMedia.mockReset()
  markFeedbackNotificationsRead.mockClear()
  dialog.confirm.mockResolvedValue(true)
})

it('管理员工作台默认显示待接单，并可切回全部', async () => {
  const wrapper = render(ManagedFeedback)
  await flushPromises()
  expect(api.listWorkflowFeedback).toHaveBeenCalledWith(expect.objectContaining({ queue: 'UNASSIGNED' }))
  expect(wrapper.findAll('.feedback-status-tabs button').find(button => button.text() === '待接单').attributes('aria-selected')).toBe('true')

  await wrapper.findAll('.feedback-status-tabs button').find(button => button.text() === '全部').trigger('click')
  await flushPromises()
  expect(api.listWorkflowFeedback).toHaveBeenLastCalledWith(expect.objectContaining({ queue: 'ALL' }))
  wrapper.unmount()
})

it('未接单工单可接单并更新详情中的运营负责人', async () => {
  api.getManagedFeedback.mockResolvedValue({ ...ticket('rpt_a'), workflowStage: 'UNASSIGNED', workArea: 'OPERATOR' })
  api.claimFeedback.mockResolvedValue({ ...ticket('rpt_a'), workflowStage: 'PROCESSING', operatorAssigneeName: '测试运营' })
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  await wrapper.findAll('button').find(button => button.text() === '接单').trigger('click')
  await flushPromises()
  expect(api.claimFeedback).toHaveBeenCalledWith('rpt_a')
  expect(wrapper.get('[role="dialog"]').text()).toContain('测试运营')
  wrapper.unmount()
})

it('程序岗只能填写内部结果并交回，不能回复用户', async () => {
  api.getFeedbackAccess.mockResolvedValue({ developer_areas: ['STAR'], available_work_areas: [{ key: 'STAR', label: '星石' }] })
  api.getManagedFeedback.mockResolvedValue({ ...ticket('rpt_a'), workArea: 'STAR', workflowStage: 'DEV_HANDOFF', viewerCanManage: false, viewerCanDevelop: true })
  api.returnFeedback.mockResolvedValue({ ...ticket('rpt_a'), workArea: 'STAR', workflowStage: 'PROCESSING', viewerCanManage: false, viewerCanDevelop: false })
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  const wrapper = render(ManagedFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  expect(wrapper.get('[role="dialog"]').text()).not.toContain('发送回复')
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
    const wrapper = render(component); await flushPromises()
    await choose(wrapper, 'rpt_a')
    const done = wrapper.findAll('.feedback-detail-actions button').find(button => button.text().includes('标记完成'))
    await done.trigger('click'); await flushPromises()
    expect(update).toHaveBeenCalledWith('rpt_a', 'RESOLVED')
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

it('完成反馈须确认，成功后切到已完成列表并告知去向', async () => {
  const wrapper = render(MyFeedback); await flushPromises()
  await choose(wrapper, 'rpt_a')
  dialog.confirm.mockResolvedValueOnce(false)
  await wrapper.findAll('.feedback-detail-actions button').find(button => button.text().includes('标记完成')).trigger('click')
  await flushPromises()
  expect(api.updateMyFeedbackStatus).not.toHaveBeenCalled()
  await wrapper.findAll('.feedback-detail-actions button').find(button => button.text().includes('标记完成')).trigger('click')
  await flushPromises()
  expect(dialog.confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '标记反馈完成？' }))
  expect(api.updateMyFeedbackStatus).toHaveBeenCalledWith('rpt_a', 'RESOLVED')
  expect(wrapper.get('.feedback-public-notice').text()).toContain('已完成')
  expect(wrapper.findAll('[role="tab"]').find(tab => tab.text() === '已完成').attributes('aria-selected')).toBe('true')
})

it('弹窗关闭、遮罩和 Esc 对文字与附件草稿使用同一放弃确认', async () => {
  const wrapper = render(MyFeedback); await flushPromises()
  await wrapper.get('.feedback-hero-action').trigger('click')
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
  expect(wrapper.get('.feedback-modal input[maxlength="120"]').element.value).toBe('')
  expect(wrapper.find('.feedback-modal .feedback-attachment-item').exists()).toBe(false)
})

it('空标题在附件上传与创建请求之前拦截', async () => {
  const wrapper = render(MyFeedback); await flushPromises()
  await wrapper.get('.feedback-hero-action').trigger('click')
  const form = wrapper.get('.feedback-modal form')
  await form.findAll('select')[1].setValue('OPERATOR')
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
  expect(wrapper.findAll('.feedback-detail-actions button').map(button => button.text())).toEqual(['标记完成'])
})

it('escape inside the nested merge dialog closes only the merge dialog', async () => {
  // 详情层的 Escape 监听挂在 window 上，必须真实挂载到 document 才能复现冒泡路径。
  const wrapper = render(ManagedFeedback, { attachTo: document.body }); await flushPromises()
  await choose(wrapper, 'rpt_a')
  await wrapper.get('.feedback-admin-merge-row button').trigger('click'); await flushPromises()
  const merge = wrapper.get('.merge-dialog')
  expect(merge.exists()).toBe(true)

  merge.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  await flushPromises()

  // 合并反馈是压在工单详情之上的二级弹窗，Escape 只能关闭最上层。
  expect(wrapper.find('.merge-dialog').exists()).toBe(false)
  expect(wrapper.find('.ticket-detail-dialog').exists()).toBe(true)
})
