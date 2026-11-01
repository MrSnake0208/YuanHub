import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { auth } from '../src/store/auth.js'
import { openNotificationEventStream } from '../src/api/notificationEvents.js'

vi.mock('../src/store/auth.js', () => ({ auth: { accessToken: 'synthetic', userInfo: { id: 'a' }, refreshToken: '', refresh: vi.fn() } }))
vi.mock('../src/api/request.js', () => ({ API_BASE: 'https://api.invalid' }))
let stream, pipes
const encoder = new TextEncoder()
beforeEach(() => {
  vi.useFakeTimers()
  pipes = []; stream = null
  auth.accessToken = 'synthetic'; auth.userInfo = { id: 'a' }; auth.refreshToken = ''; auth.refresh.mockReset()
  fetch.mockImplementation(async (_, options) => {
    let pipe
    const body = new ReadableStream({ start(controller) { pipe = controller } })
    options.signal.addEventListener('abort', () => { try { pipe.error(new DOMException('Aborted', 'AbortError')) } catch (_) {} })
    pipes.push(pipe)
    return { ok: true, status: 200, headers: new Headers({ 'content-type': 'text/event-stream;charset=UTF-8' }), body }
  })
})
afterEach(() => stream?.close())

it('只用请求头传JWT，跨chunk解析CRLF、注释、多行JSON和中文', async () => {
  const onEvent = vi.fn(), onOpen = vi.fn()
  stream = openNotificationEventStream({ onEvent, onOpen })
  await flushPromises()
  const [url, options] = fetch.mock.calls[0]
  expect(url).toBe('https://api.invalid/v1/notifications/events')
  expect(options.headers.Authorization).toBe('Bearer synthetic')
  expect(options.cache).toBe('no-store')
  expect(onOpen).toHaveBeenCalledOnce()
  const bytes = encoder.encode(': keepalive\r\nid: ntf_1\r\nevent: notification_created\r\ndata: {"id":\r\ndata: "中文"}\r\n\r\n')
  for (let i = 0; i < bytes.length; i += 5) pipes[0].enqueue(bytes.slice(i, i + 5))
  await flushPromises()
  expect(onEvent).toHaveBeenCalledExactlyOnceWith({ event: 'notification_created', id: 'ntf_1', data: { id: '中文' } })
})

it('断流报告不可用并自动重连；关闭后取消读取与重试', async () => {
  const onError = vi.fn()
  stream = openNotificationEventStream({ onError })
  await flushPromises(); pipes[0].close(); await flushPromises()
  expect(onError).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1000)
  expect(fetch).toHaveBeenCalledTimes(2)
  stream.close(); await flushPromises()
  expect(fetch.mock.calls[1][1].signal.aborted).toBe(true)
  await vi.advanceTimersByTimeAsync(60000)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('静默断网45秒后重连；心跳能延期超时', async () => {
  const onError = vi.fn()
  stream = openNotificationEventStream({ onError })
  await flushPromises()
  await vi.advanceTimersByTimeAsync(30000)
  pipes[0].enqueue(encoder.encode(': keepalive\n\n')); await flushPromises()
  await vi.advanceTimersByTimeAsync(30000)
  expect(onError).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(15000)
  expect(onError).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(1000)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('401刷新token后重连，但账号切换后不会重试旧连接', async () => {
  fetch.mockResolvedValueOnce({ status: 401, ok: false })
  auth.refreshToken = 'refresh-synthetic'
  auth.refresh.mockImplementation(async () => { auth.accessToken = 'refreshed'; return true })
  stream = openNotificationEventStream()
  await flushPromises(); await vi.advanceTimersByTimeAsync(1000)
  expect(auth.refresh).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer refreshed')
  auth.userInfo = { id: 'b' }
  pipes[0].close(); await flushPromises(); await vi.advanceTimersByTimeAsync(20000)
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('错误内容类型安静回退，不把普通JSON当作健康连接', async () => {
  fetch.mockResolvedValueOnce({ status: 200, ok: true, body: {}, headers: new Headers({ 'content-type': 'application/json' }) })
  const onOpen = vi.fn(), onError = vi.fn()
  stream = openNotificationEventStream({ onOpen, onError }); await flushPromises()
  expect(onOpen).not.toHaveBeenCalled()
  expect(onError).toHaveBeenCalledOnce()
})
