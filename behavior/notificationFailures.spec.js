import { beforeEach, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import NotificationsPage from '../src/pages/notifications/index.vue'
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../src/api/notifications.js'
import { notificationUnreadState, refreshNotificationState } from '../src/store/notificationUnread.js'
import { auth } from '../src/store/auth.js'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('../src/api/notifications.js', () => ({ listNotifications: vi.fn(), markNotificationRead: vi.fn(), markAllNotificationsRead: vi.fn() }))
vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: 'session-a', userInfo: { id: 'user-a' }, adminAccess: null }) }
})
vi.mock('../src/store/notificationUnread.js', async () => {
  const { reactive } = await import('vue')
  const notificationUnreadState = reactive({ count: 0 })
  return { notificationUnreadState, setNotificationUnreadCount: value => { notificationUnreadState.count = value }, refreshNotificationState: vi.fn() }
})

const first = { id: 'notice-1', title: '新回复', body: '详情', readAt: null, createdAt: '2026-09-27T00:00:00Z' }
const second = { ...first, id: 'notice-2', title: '第二条' }
const render = () => mount(NotificationsPage, { global: { stubs: { RouterLink: RouterLinkStub, IslandSidebar: true, SiteFooter: true, AccountIdDetails: true } } })

beforeEach(() => {
  vi.clearAllMocks()
  auth.accessToken = 'session-a'
  auth.userInfo = { id: 'user-a' }
  notificationUnreadState.count = 0
  listNotifications.mockReset().mockResolvedValue({ notifications: [{ ...first }], total: 2, unreadCount: 2 })
  markNotificationRead.mockReset()
  markAllNotificationsRead.mockReset()
  refreshNotificationState.mockReset().mockResolvedValue({ count: 0 })
})

const deferred = () => {
  let resolve, reject
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}
const batch = start => Array.from({ length: 20 }, (_, index) => ({ ...first, id: 'notice-' + (start + index), title: '通知 ' + (start + index) }))
async function loadTwoPages() {
  listNotifications.mockResolvedValueOnce({ notifications: batch(1), total: 40, unreadCount: 40 })
    .mockResolvedValueOnce({ notifications: batch(21), total: 40, unreadCount: 40 })
  const wrapper = render(); await flushPromises()
  await wrapper.get('.btn-more').trigger('click'); await flushPromises()
  return wrapper
}

it('加载两页后单条已读保留全部40条并复用角标刷新', async () => {
  const wrapper = await loadTwoPages()
  markNotificationRead.mockResolvedValue({ ...batch(1)[0], readAt: '2026-10-05T00:00:00Z' })
  refreshNotificationState.mockImplementation(() => { notificationUnreadState.count = 39; return Promise.resolve({ count: 39 }) })
  await wrapper.findAll('.ntf-read-btn')[0].trigger('click'); await flushPromises()
  expect(wrapper.findAll('.notification-item')).toHaveLength(40)
  expect(wrapper.findAll('.notification-item')[0].classes()).not.toContain('unread')
  expect(wrapper.findAll('.notification-item')[39].text()).toContain('通知 40')
  expect(listNotifications).toHaveBeenCalledTimes(2)
  expect(refreshNotificationState).toHaveBeenCalledWith({ force: true })
  expect(wrapper.get('.unread-badge').text()).toBe('39')
})

it('两页全部已读保留40条并禁止重复标记', async () => {
  const wrapper = await loadTwoPages()
  const pending = deferred()
  markAllNotificationsRead.mockReturnValue(pending.promise)
  await wrapper.get('.notification-actions button').trigger('click')
  expect(wrapper.get('.notification-actions button').element.disabled).toBe(true)
  expect(wrapper.findAll('.tabs button').every(button => button.element.disabled)).toBe(true)
  await wrapper.get('.notification-actions button').trigger('click')
  pending.resolve({ updated: 40 }); await flushPromises()
  expect(markAllNotificationsRead).toHaveBeenCalledTimes(1)
  expect(wrapper.findAll('.notification-item')).toHaveLength(40)
  expect(wrapper.findAll('.notification-item.unread')).toHaveLength(0)
  expect(listNotifications).toHaveBeenCalledTimes(2)
})

it('未读模式两页后标记回第一页重建，下一页不跳项', async () => {
  const wrapper = render(); await flushPromises()
  listNotifications.mockResolvedValueOnce({ notifications: batch(1), total: 60, unreadCount: 60 })
    .mockResolvedValueOnce({ notifications: batch(21), total: 60, unreadCount: 60 })
  await wrapper.findAll('.tabs button')[1].trigger('click'); await flushPromises()
  await wrapper.get('.btn-more').trigger('click'); await flushPromises()
  markNotificationRead.mockResolvedValue({ ...batch(1)[0], readAt: '2026-10-05T00:00:00Z' })
  listNotifications.mockResolvedValueOnce({ notifications: batch(2), total: 59, unreadCount: 59 })
    .mockResolvedValueOnce({ notifications: batch(22), total: 59, unreadCount: 59 })
  await wrapper.findAll('.ntf-read-btn')[0].trigger('click'); await flushPromises()
  expect(listNotifications).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, unreadOnly: true })
  expect(wrapper.findAll('.notification-item')).toHaveLength(20)
  await wrapper.get('.btn-more').trigger('click'); await flushPromises()
  expect(listNotifications).toHaveBeenLastCalledWith({ page: 2, pageSize: 20, unreadOnly: true })
  expect(wrapper.findAll('.notification-item')[20].text()).toContain('通知 22')
})

it('已读成功但刷新失败独立提示，重试刷新不再次标记', async () => {
  const wrapper = render(); await flushPromises()
  await wrapper.findAll('.tabs button')[1].trigger('click'); await flushPromises()
  markNotificationRead.mockResolvedValue({ ...first, readAt: '2026-10-05T00:00:00Z' })
  listNotifications.mockRejectedValueOnce(new Error('offline'))
  await wrapper.get('.ntf-read-btn').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('已标记成功，但通知刷新失败')
  expect(wrapper.text()).not.toContain('标记失败')
  listNotifications.mockResolvedValueOnce({ notifications: [{ ...second }], total: 1, unreadCount: 1 })
  await wrapper.get('.state.err button').trigger('click'); await flushPromises()
  expect(wrapper.text()).toContain('第二条')
  expect(markNotificationRead).toHaveBeenCalledTimes(1)
})

it('未读模式全部已读经成功刷新后才显示准确空态', async () => {
  const wrapper = render(); await flushPromises()
  await wrapper.findAll('.tabs button')[1].trigger('click'); await flushPromises()
  markAllNotificationsRead.mockResolvedValue({ updated: 2 })
  listNotifications.mockResolvedValueOnce({ notifications: [], total: 0, unreadCount: 0 })
  await wrapper.get('.notification-actions button').trigger('click'); await flushPromises()
  expect(listNotifications).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, unreadOnly: true })
  expect(wrapper.get('.empty-state').text()).toContain('未读通知已看完')
  expect(wrapper.get('.sort-lb').text()).toBe('共 0 条')
  expect(wrapper.get('.notification-actions button').element.disabled).toBe(true)
})

it.each(['resolve', 'reject'])('换用户后旧列表%s不覆盖新列表或角标', async outcome => {
  const pending = deferred()
  listNotifications.mockReturnValueOnce(pending.promise)
  const wrapper = render()
  listNotifications.mockResolvedValue({ notifications: [{ ...second, title: '用户B列表' }], total: 1, unreadCount: 3 })
  auth.userInfo = { id: 'user-b' }; await flushPromises()
  if (outcome === 'resolve') pending.resolve({ notifications: [{ ...first }], total: 1, unreadCount: 99 })
  else pending.reject(new Error('旧列表失败'))
  await flushPromises()
  expect(wrapper.text()).toContain('用户B列表')
  expect(wrapper.text()).not.toContain('旧列表失败')
  expect(notificationUnreadState.count).toBe(3)
})

it.each(['resolve', 'reject'])('旧加载更多%s不污染新筛选，也不解除新分页请求的等待', async outcome => {
  const wrapper = render(); await flushPromises()
  const old = deferred(), current = deferred()
  listNotifications.mockReturnValueOnce(old.promise)
  await wrapper.get('.btn-more').trigger('click')
  listNotifications.mockResolvedValueOnce({ notifications: [{ ...second }], total: 2, unreadCount: 1 })
  await wrapper.findAll('.tabs button')[1].trigger('click'); await flushPromises()
  listNotifications.mockReturnValueOnce(current.promise)
  await wrapper.get('.btn-more').trigger('click')
  if (outcome === 'resolve') old.resolve({ notifications: [{ ...first, title: '旧结果' }], total: 2, unreadCount: 20 })
  else old.reject(new Error('旧错误'))
  await flushPromises()
  expect(wrapper.text()).not.toContain('旧结果')
  expect(wrapper.text()).not.toContain('加载更多失败')
  expect(wrapper.get('.btn-more').element.disabled).toBe(true)
  current.resolve({ notifications: [{ ...first, id: 'new-third', title: '新筛选第二页' }], total: 2, unreadCount: 1 })
  await flushPromises()
  expect(wrapper.text()).toContain('新筛选第二页')
})

it('已读成功使在途加载更多失效，不追加旧的未读状态', async () => {
  const wrapper = render(); await flushPromises()
  const old = deferred()
  listNotifications.mockReturnValueOnce(old.promise)
  await wrapper.get('.btn-more').trigger('click')
  markNotificationRead.mockResolvedValue({ ...first, readAt: '2026-10-05T00:00:00Z' })
  await wrapper.get('.ntf-read-btn').trigger('click'); await flushPromises()
  old.resolve({ notifications: [{ ...second }], total: 2, unreadCount: 2 }); await flushPromises()
  expect(wrapper.findAll('.notification-item')).toHaveLength(1)
  expect(wrapper.find('.notification-item.unread').exists()).toBe(false)
  expect(wrapper.get('.btn-more').element.disabled).toBe(false)
})

it.each(['resolve', 'reject'])('换用户后旧已读%s不污染新列表、错误和角标', async outcome => {
  const wrapper = render(); await flushPromises()
  const old = deferred()
  markNotificationRead.mockReturnValue(old.promise)
  await wrapper.get('.ntf-read-btn').trigger('click')
  listNotifications.mockResolvedValue({ notifications: [{ ...second, id: 'user-b-notice', title: '用户B通知' }], total: 1, unreadCount: 5 })
  auth.userInfo = { id: 'user-b' }; await flushPromises()
  if (outcome === 'resolve') old.resolve({ ...first, readAt: '2026-10-05T00:00:00Z' })
  else old.reject(new Error('旧标记失败'))
  await flushPromises()
  expect(wrapper.text()).toContain('用户B通知')
  expect(wrapper.text()).not.toContain('标记失败')
  expect(notificationUnreadState.count).toBe(5)
  expect(refreshNotificationState).not.toHaveBeenCalled()
})

it('卸载后旧读取和已读回调不更新共享角标', async () => {
  const read = deferred()
  listNotifications.mockReturnValueOnce(read.promise)
  const wrapper = render()
  wrapper.unmount()
  read.resolve({ notifications: [{ ...first }], total: 1, unreadCount: 99 }); await flushPromises()
  expect(notificationUnreadState.count).toBe(0)
  const next = render(); await flushPromises()
  const mutation = deferred()
  markNotificationRead.mockReturnValue(mutation.promise)
  await next.get('.ntf-read-btn').trigger('click')
  next.unmount()
  mutation.resolve({ ...first, readAt: '2026-10-05T00:00:00Z' }); await flushPromises()
  expect(refreshNotificationState).not.toHaveBeenCalled()
})

it('全部已读失败保留未读并可重试', async () => {
  markAllNotificationsRead.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({})
  const wrapper = render(); await flushPromises()
  await wrapper.get('.notification-actions button').trigger('click'); await flushPromises()
  expect(wrapper.get('.notification-toolbar [role="alert"]').text()).toContain('失败')
  expect(wrapper.get('.notification-item.unread').exists()).toBe(true)
  expect(wrapper.get('.notification-actions button').text()).toContain('重试')
  await wrapper.get('.notification-actions button').trigger('click'); await flushPromises()
  expect(markAllNotificationsRead).toHaveBeenCalledTimes(2)
  expect(wrapper.find('.notification-toolbar [role="alert"]').exists()).toBe(false)
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
