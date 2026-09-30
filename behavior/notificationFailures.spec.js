import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import NotificationsPage from '../src/pages/notifications/index.vue'
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../src/api/notifications.js'
import { notificationUnreadState } from '../src/store/notificationUnread.js'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../src/api/notifications.js', () => ({ listNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }))
vi.mock('../src/store/notificationUnread.js', async () => {
  const { reactive } = await import('vue')
  const notificationUnreadState = reactive({ count: 0 })
  return { notificationUnreadState, setNotificationUnreadCount: value => { notificationUnreadState.count = value } }
})

const first = { id: 'notice-1', title: '新回复', body: '详情', readAt: null, createdAt: '2026-09-27T00:00:00Z' }
const second = { ...first, id: 'notice-2', title: '第二条' }
const render = () => mount(NotificationsPage, { global: { stubs: { RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true, AccountIdDetails: true } } })

beforeEach(() => {
  vi.clearAllMocks()
  notificationUnreadState.count = 0
  listNotifications.mockResolvedValue({ notifications: [first], total: 2, unreadCount: 2 })
})

it('全部已读失败保留未读并可重试', async () => {
  markAllNotificationsRead.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({})
  const wrapper = render(); await flushPromises()
  await wrapper.get('.hero-action button').trigger('click'); await flushPromises()
  expect(wrapper.get('.hero-action [role="alert"]').text()).toContain('失败')
  expect(wrapper.get('.notification-item.unread').exists()).toBe(true)
  expect(wrapper.get('.hero-action button').text()).toContain('重试')
  await wrapper.get('.hero-action button').trigger('click'); await flushPromises()
  expect(markAllNotificationsRead).toHaveBeenCalledTimes(2)
  expect(wrapper.find('.hero-action [role="alert"]').exists()).toBe(false)
})

it('单条已读失败保留操作并标出重试', async () => {
  markNotificationRead.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ ...first, readAt: '2026-09-27T01:00:00Z' })
  const wrapper = render(); await flushPromises()
  await wrapper.get('.ntf-read-btn').trigger('click'); await flushPromises()
  expect(wrapper.get('.notification-item [role="alert"]').text()).toContain('标记失败')
  expect(wrapper.get('.ntf-read-btn').text()).toContain('重试')
  await wrapper.get('.ntf-read-btn').trigger('click'); await flushPromises()
  expect(markNotificationRead).toHaveBeenCalledTimes(2)
  expect(wrapper.find('.notification-item [role="alert"]').exists()).toBe(false)
})

it('加载更多失败保留已加载通知和页码，再试可追加', async () => {
  const wrapper = render(); await flushPromises()
  listNotifications.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ notifications: [second], total: 2, unreadCount: 2 })
  await wrapper.get('.btn-more').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.notification-item')).toHaveLength(1)
  expect(wrapper.get('.more-row [role="alert"]').text()).toContain('已加载的通知仍可查看')
  await wrapper.get('.btn-more').trigger('click'); await flushPromises()
  expect(wrapper.findAll('.notification-item')).toHaveLength(2)
  expect(listNotifications).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 })
})

it('首次没有通知可进入我的反馈，未读为空可切回全部', async () => {
  listNotifications.mockResolvedValue({ notifications: [], total: 0, unreadCount: 0 })
  const wrapper = render(); await flushPromises()
  expect(wrapper.get('.empty-state').text()).toContain('还没有收到通知')
  expect(wrapper.get('.empty-state').findComponent(RouterLinkStub).props('to')).toBe('/feedback')
  await wrapper.findAll('.tabs button')[1].trigger('click'); await flushPromises()
  expect(wrapper.get('.empty-state').text()).toContain('未读通知已看完')
  expect(listNotifications).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, unreadOnly: true })
  await wrapper.get('.empty-state button').trigger('click'); await flushPromises()
  expect(listNotifications).toHaveBeenLastCalledWith({ page: 1, pageSize: 20 })
  expect(markAllNotificationsRead).not.toHaveBeenCalled()
})
