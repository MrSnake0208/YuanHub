import { expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import NotificationsPage from '../src/pages/notifications/index.vue'
import { listNotifications } from '../src/api/notifications.js'
import { auth } from '../src/store/auth.js'

const push = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('../src/api/notifications.js', () => ({ listNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }))

it('通知默认隐藏关联工单内部编号，展开技术详情不会触发导航', async () => {
  listNotifications.mockResolvedValue({ notifications: [{ id: 'notice-1', title: '有新回复', body: '请查看反馈', refType: 'FEEDBACK', refId: 'ticket-internal-1', kind: 'FEEDBACK_REPLY', readAt: '2026-09-27T00:00:00Z', createdAt: '2026-09-27T00:00:00Z' }], total: 1, unreadCount: 0 })
  const wrapper = mount(NotificationsPage, { global: { stubs: { IslandSidebar: true, SiteFooter: true } } })
  await flushPromises()
  const details = wrapper.get('.notification-item details')
  expect(details.element.open).toBe(false)
  expect(wrapper.get('.notification-item .ntf-title').text()).toBe('有新回复')
  await details.get('summary').trigger('click')
  expect(details.element.open).toBe(true)
  expect(details.get('code').text()).toBe('ticket-internal-1')
  expect(push).not.toHaveBeenCalled()
  wrapper.unmount()
})

it('程序交接通知打开后台工单详情', async () => {
  push.mockClear()
  const previousAccess = auth.adminAccess
  auth.adminAccess = { superAdmin: false, operatorAreas: [], developerAreas: ['STAR'] }
  listNotifications.mockResolvedValue({ notifications: [{ id: 'notice-dev', title: '反馈转程序处理', body: '请处理', refType: 'FEEDBACK', refId: 'rpt_1', kind: 'FEEDBACK_DEV_HANDOFF', readAt: '2026-09-28T00:00:00Z', createdAt: '2026-09-28T00:00:00Z' }], total: 1, unreadCount: 0 })
  const wrapper = mount(NotificationsPage, { global: { stubs: { IslandSidebar: true, SiteFooter: true } } })
  try {
    await flushPromises()
    await wrapper.get('.notification-item').trigger('click')
    expect(push).toHaveBeenCalledExactlyOnceWith('/feedback/manage?id=rpt_1')
  } finally {
    wrapper.unmount()
    auth.adminAccess = previousAccess
  }
})
