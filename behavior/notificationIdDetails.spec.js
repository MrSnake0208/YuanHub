import { expect, it, vi } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import NotificationsPage from '../src/pages/notifications/index.vue'
import { listNotifications } from '../src/api/notifications.js'
import { auth } from '../src/store/auth.js'

const push = vi.hoisted(() => vi.fn())
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('../src/api/notifications.js', () => ({ listNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }))

it('交接通知直接呈现交接双方、反馈摘要和说明并保留详情入口', async () => {
  const previousAccess = auth.adminAccess
  auth.adminAccess = { superAdmin: false, operatorAreas: ['STAR'], developerAreas: [] }
  const title = '小王转交了「签到问题」（小王 → 小李）'
  const body = '反馈摘要：连续签到后奖励未到账\n交接说明：请核查奖励发放逻辑'
  listNotifications.mockResolvedValue({ notifications: [{ id: 'notice-assign', title, body, refType: 'FEEDBACK', refId: 'rpt_1', kind: 'FEEDBACK_ASSIGNED', readAt: '2026-09-30T00:00:00Z' }], total: 1, unreadCount: 0 })
  const wrapper = mount(NotificationsPage, { global: { stubs: { RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true } } })
  try {
    await flushPromises()
    expect(wrapper.get('.ntf-title').text()).toBe(title)
    expect(wrapper.get('.ntf-text').element.textContent).toBe(body)
    expect(wrapper.get('.ntf-open-link').attributes('href')).toBe('/feedback/manage?id=rpt_1')
  } finally {
    wrapper.unmount()
    auth.adminAccess = previousAccess
  }
})

it('通知默认隐藏关联工单内部编号，展开技术详情不会触发导航', async () => {
  listNotifications.mockResolvedValue({ notifications: [{ id: 'notice-1', title: '有新回复', body: '请查看反馈', refType: 'FEEDBACK', refId: 'ticket-internal-1', kind: 'FEEDBACK_REPLY', readAt: '2026-09-27T00:00:00Z', createdAt: '2026-09-27T00:00:00Z' }], total: 1, unreadCount: 0 })
  const wrapper = mount(NotificationsPage, { global: { stubs: { RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true } } })
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
  const wrapper = mount(NotificationsPage, { global: { stubs: { RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true } } })
  try {
    await flushPromises()
    const link = wrapper.get('.ntf-open-link')
    expect(link.element.tagName).toBe('A')
    expect(link.attributes('href')).toBe('/feedback/manage?id=rpt_1')
    await link.trigger('click', { metaKey: true })
    expect(push).not.toHaveBeenCalled()
    await link.trigger('click')
    expect(push).toHaveBeenCalledExactlyOnceWith('/feedback/manage?id=rpt_1')
  } finally {
    wrapper.unmount()
    auth.adminAccess = previousAccess
  }
})
