import { API_BASE } from './request.js'
import { auth } from '../store/auth.js'

// Account SSE client. EventSource cannot send a Bearer header, so use fetch.
export function openAccountEventStream({ accountId, onEvent, onError, onOpen } = {}) {
  let closed = false
  let controller = new AbortController()
  let retryTimer = null
  let retryDelay = 1000

  function scheduleRetry() {
    if (closed || retryTimer != null) return
    retryTimer = setTimeout(function () {
      retryTimer = null
      connect()
    }, retryDelay)
    retryDelay = Math.min(15000, retryDelay * 2)
  }

  async function connect() {
    if (closed || !accountId || !auth.accessToken) return
    controller = new AbortController()
    try {
      const response = await fetch(API_BASE + '/v1/accounts/' + encodeURIComponent(accountId) + '/events', {
        method: 'GET',
        headers: {
          Authorization: 'Bearer ' + auth.accessToken,
          Accept: 'text/event-stream',
          'Cache-Control': 'no-cache'
        },
        cache: 'no-store',
        signal: controller.signal
      })
      if (!response.ok || !response.body) {
        if (response.status === 401 && auth.refreshToken) {
          const refreshed = await auth.refresh()
          if (refreshed && !closed) {
            retryDelay = 1000
            connect()
            return
          }
        }
        const error = new Error('账号事件连接失败')
        error.status = response.status
        throw error
      }
      retryDelay = 1000
      if (onOpen) onOpen()
      await readStream(response.body)
      if (!closed) scheduleRetry()
    } catch (error) {
      if (closed || error.name === 'AbortError') return
      if (onError) onError(error)
      scheduleRetry()
    }
  }

  async function readStream(body) {
    const reader = body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let eventName = 'message'
    let eventId = ''
    let dataLines = []

    function dispatch() {
      if (!dataLines.length) {
        eventName = 'message'
        eventId = ''
        return
      }
      const raw = dataLines.join('\n')
      let data = raw
      try { data = JSON.parse(raw) } catch (_) { /* Plain text SSE is valid too. */ }
      if (onEvent) onEvent({ event: eventName, id: eventId, data: data })
      eventName = 'message'
      eventId = ''
      dataLines = []
    }

    function consumeLine(line) {
      if (!line) { dispatch(); return }
      if (line[0] === ':') return
      const separator = line.indexOf(':')
      const field = separator < 0 ? line : line.slice(0, separator)
      let value = separator < 0 ? '' : line.slice(separator + 1)
      if (value[0] === ' ') value = value.slice(1)
      if (field === 'event') eventName = value
      else if (field === 'id') eventId = value
      else if (field === 'data') dataLines.push(value)
    }

    while (!closed) {
      const result = await reader.read()
      buffer += decoder.decode(result.value || new Uint8Array(), { stream: !result.done })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      lines.forEach(consumeLine)
      if (result.done) {
        if (buffer) consumeLine(buffer)
        dispatch()
        return
      }
    }
  }

  function close() {
    closed = true
    if (retryTimer != null) clearTimeout(retryTimer)
    retryTimer = null
    controller.abort()
  }

  connect()
  return { close }
}
