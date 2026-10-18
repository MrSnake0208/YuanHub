import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { auth } from '../src/store/auth.js'
import { listUnreadNotifications } from '../src/api/notifications.js'
import { openNotificationEventStream } from '../src/api/notificationEvents.js'
import { notificationUnreadState } from '../src/store/notificationUnread.js'
import { notificationRealtimeState, startNotificationRealtime, dismissFeedbackNotification, subscribeFeedbackNotificationRefresh } from '../src/store/notificationRealtime.js'
import { playNotificationSound } from '../src/utils/notificationSound.js'
import { claimFeedbackNotification } from '../src/utils/notificationClaims.js'

vi.mock('../src/store/auth.js', async () => {
  const { reactive } = await import('vue')
  return { auth: reactive({ accessToken: '', userInfo: null }) }
})
vi.mock('../src/api/notifications.js', () => ({
  listUnreadNotifications: vi.fn(), getUnreadNotificationCount: vi.fn(async () => ({ count: 0 })),
  getUnreadFeedbackNotificationRefs: items => items.filter(item => item.refType === 'FEEDBACK').map(item => item.refId),
  NOTIFICATION_STATE_EVENT: 'test:notification-change'
}))
vi.mock('../src/api/notificationEvents.js', () => ({ openNotificationEventStream: vi.fn() }))
vi.mock('../src/utils/notificationSound.js', () => ({
  canPlayNotificationSound: () => true, playNotificationSound: vi.fn(), subscribeNotificationSound: () => () => {}
}))

let items, streams, stop
const notice = (id, kind = 'FEEDBACK_REPLY') => ({ id, kind, refType: 'FEEDBACK', refId: 'ticket', title: '新回复', body: '回复正文', readAt: null })
const start = async () => { stop = startNotificationRealtime(); await flushPromises() }
const event = async () => { streams.at(-1).onEvent({ event: 'notification_created', id: 'event' }); await flushPromises() }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-18T00:00:00Z'))
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'user-a' }
  Object.assign(notificationUnreadState, { count: 0, unreadNotifications: [], loaded: false, detailsLoaded: false })
  items = []; streams = []; stop = null
  listUnreadNotifications.mockReset().mockImplementation(async () => items.slice())
  openNotificationEventStream.mockReset().mockImplementation(options => { const stream = { ...options, close: vi.fn() }; streams.push(stream); return stream })
  playNotificationSound.mockClear()
})
afterEach(() => { stop?.(); Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' }) })

it('历史基线保留角标但不弹卡、不响；首次连接补查也静默', async () => {
  items = [notice('historical')]
  await start()
  expect(notificationUnreadState.count).toBe(1)
  expect(notificationRealtimeState.toasts).toEqual([])
  streams[0].onOpen(); await flushPromises()
  expect(playNotificationSound).not.toHaveBeenCalled()
  expect(notificationRealtimeState.toasts).toEqual([])
})

it('新反馈实时更新共享未读；重复事件不重复提醒，短时批量只响一次', async () => {
  await start()
  items = [notice('burst-a'), notice('burst-b', 'FEEDBACK_MESSAGE_FROM_REPORTER'), notice('status', 'FEEDBACK_STATUS_UPDATED')]
  await event(); await event()
  expect(notificationUnreadState.count).toBe(3)
  expect(notificationRealtimeState.toasts.map(item => item.id)).toEqual(['burst-a', 'burst-b'])
  expect(playNotificationSound).toHaveBeenCalledTimes(1)
  dismissFeedbackNotification('burst-a')
  expect(notificationUnreadState.count).toBe(3)
  await vi.advanceTimersByTimeAsync(5000)
  expect(notificationRealtimeState.toasts).toEqual([])
  expect(notificationUnreadState.count).toBe(3)
})

it('健康连接跳过30秒重复轮询，120秒补偿；断线恢复30秒查询且只提醒新增ID', async () => {
  await start()
  streams[0].onOpen(); await flushPromises()
  const baselineCalls = listUnreadNotifications.mock.calls.length
  await vi.advanceTimersByTimeAsync(90000)
  expect(listUnreadNotifications).toHaveBeenCalledTimes(baselineCalls)
  items = [notice('compensated')]
  await vi.advanceTimersByTimeAsync(30000)
  expect(notificationRealtimeState.toasts.map(item => item.id)).toEqual(['compensated'])
  streams[0].onError(new Error('offline'))
  const calls = listUnreadNotifications.mock.calls.length
  await vi.advanceTimersByTimeAsync(30000)
  expect(listUnreadNotifications).toHaveBeenCalledTimes(calls + 1)
  expect(playNotificationSound).toHaveBeenCalledTimes(1)
})

it('SSE事件到达正在读取的快照期间，补查第二次而不是丢掉更新', async () => {
  await start()
  let resolve
  listUnreadNotifications.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  streams[0].onEvent({ event: 'notification_created' })
  items = [notice('during-request')]
  streams[0].onEvent({ event: 'notification_created' })
  resolve([]); await flushPromises()
  expect(notificationRealtimeState.toasts.map(item => item.id)).toEqual(['during-request'])
})

it('账号切换关闭旧流、清空卡片，拒绝A的迟到响应与旧回调', async () => {
  await start()
  items = [notice('before-switch')]; await event()
  let resolve
  listUnreadNotifications.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  streams[0].onEvent({ event: 'notification_created' })
  const old = streams[0]
  items = [notice('b-history')]
  auth.userInfo = { id: 'user-b' }
  await flushPromises()
  resolve([notice('late-a')]); old.onEvent({ event: 'notification_created' }); await flushPromises()
  expect(old.close).toHaveBeenCalledOnce()
  expect(notificationRealtimeState.toasts).toEqual([])
  expect(notificationUnreadState.unreadNotifications.map(item => item.id)).toEqual(['b-history'])
  auth.accessToken = ''; auth.userInfo = null; await flushPromises()
  expect(notificationUnreadState.count).toBe(0)
  expect(streams.at(-1).close).toHaveBeenCalledOnce()
})

it('初次列表失败不把后续历史当新消息；退出清除轮询', async () => {
  listUnreadNotifications.mockRejectedValueOnce(new Error('offline'))
  await start()
  expect(streams).toHaveLength(0)
  items = [notice('delayed-history')]
  await vi.advanceTimersByTimeAsync(30000)
  expect(streams).toHaveLength(1)
  expect(notificationRealtimeState.toasts).toEqual([])
  stop(); stop = null
  const calls = listUnreadNotifications.mock.calls.length
  await vi.advanceTimersByTimeAsync(120000)
  expect(listUnreadNotifications).toHaveBeenCalledTimes(calls)
})

it('已打开详情优先刷新；刷新成功不弹卡或发声，失败仍有入口', async () => {
  await start()
  const handler = vi.fn().mockResolvedValueOnce(true).mockRejectedValueOnce(new Error('detail failed'))
  const off = subscribeFeedbackNotificationRefresh(handler)
  try {
    items = [notice('open-detail')]; await event()
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 'open-detail' }))
    expect(notificationRealtimeState.toasts).toEqual([])
    expect(playNotificationSound).not.toHaveBeenCalled()
    items.push(notice('failed-detail')); await event()
    expect(notificationRealtimeState.toasts.map(item => item.id)).toEqual(['failed-detail'])
  } finally { off() }
})

it('后台标签页延后提醒；前台标签已认领的消息不再发声或弹出', async () => {
  await start()
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  items = [notice('cross-tab')]; await event()
  expect(notificationRealtimeState.toasts).toEqual([])
  const claimed = await claimFeedbackNotification('user-a', 'cross-tab', true, () => true)
  expect(claimed.claimed).toBe(true)
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  document.dispatchEvent(new Event('visibilitychange')); await flushPromises()
  expect(notificationRealtimeState.toasts).toEqual([])
  expect(playNotificationSound).not.toHaveBeenCalled()
})

it('跨标签认领在同一用户锁中串行，声音冷却共享且账号隔离', async () => {
  let queued = Promise.resolve()
  const request = vi.fn((key, action) => { const result = queued.then(action); queued = result; return result })
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
  try {
    const results = await Promise.all([
      claimFeedbackNotification('user-a', 'locked', true, () => true),
      claimFeedbackNotification('user-a', 'locked', true, () => true),
      claimFeedbackNotification('user-a', 'locked-next', true, () => true),
      claimFeedbackNotification('user-b', 'locked', true, () => true)
    ])
    expect(results).toEqual([{ claimed: true, sound: true }, { claimed: false, sound: false }, { claimed: true, sound: false }, { claimed: true, sound: true }])
    expect(request.mock.calls[0][0]).toBe(request.mock.calls[1][0])
    expect(request.mock.calls[3][0]).not.toBe(request.mock.calls[0][0])
    expect(await claimFeedbackNotification('user-c', 'stale', true, () => false)).toEqual({ claimed: false, sound: false })
  } finally { Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }) }
})

it('浏览器拒绝Web Lock时仍可本地认领且ID去重', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: vi.fn().mockRejectedValue(new Error('document inactive')) } })
  try {
    expect(await claimFeedbackNotification('lock-denied', 'one', false, () => true)).toEqual({ claimed: true, sound: false })
    expect(await claimFeedbackNotification('lock-denied', 'one', false, () => true)).toEqual({ claimed: false, sound: false })
  } finally { Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }) }
})
