import { API_BASE } from './request.js'
import { auth } from '../store/auth.js'

function identity() {
  const user = auth.userInfo
  return auth.accessToken ? String(user?.id || user?.userId || user?.user_id || '') : ''
}

// EventSource cannot attach the JWT header. Never put credentials in the URL.
export function openNotificationEventStream({ onEvent, onOpen, onError } = {}) {
  const owner = identity()
  let closed = false
  let controller
  let retryTimer
  let watchdog
  let delay = 1000
  const active = () => !closed && owner && identity() === owner

  function touch() {
    clearTimeout(watchdog)
    watchdog = setTimeout(() => controller?.abort(), 45000)
  }

  async function connect() {
    if (!active()) return
    controller = new AbortController()
    touch()
    let reader
    try {
      const response = await fetch(API_BASE + '/v1/notifications/events', {
        headers: { Authorization: 'Bearer ' + auth.accessToken, Accept: 'text/event-stream' },
        cache: 'no-store',
        signal: controller.signal
      })
      if (!active()) return
      if (response.status === 401 && auth.refreshToken) {
        if (await auth.refresh() && active()) return
      }
      if (!response.ok || !response.body || !response.headers.get('content-type')?.includes('text/event-stream')) {
        throw new Error('通知事件连接不可用')
      }
      delay = 1000
      onOpen?.()
      reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let event = 'message'
      let id = ''
      let data = []
      while (active()) {
        const result = await reader.read()
        if (!active()) return
        if (result.done) throw new Error('通知事件连接已断开')
        touch()
        buffer += decoder.decode(result.value, { stream: true })
        let end
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, end).replace(/\r$/, '')
          buffer = buffer.slice(end + 1)
          if (!line) {
            if (data.length) {
              let payload
              try { payload = JSON.parse(data.join('\n')) } catch (_) { payload = null }
              if (active()) onEvent?.({ event, id, data: payload })
            }
            event = 'message'; id = ''; data = []
          } else if (!line.startsWith(':')) {
            const separator = line.indexOf(':')
            const field = separator < 0 ? line : line.slice(0, separator)
            const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '')
            if (field === 'event') event = value
            else if (field === 'id') id = value
            else if (field === 'data') data.push(value)
          }
        }
      }
    } catch (error) {
      if (active()) onError?.(error)
    } finally {
      clearTimeout(watchdog)
      if (reader) {
        try { await reader.cancel() } catch (_) { /* Already disconnected. */ }
        reader.releaseLock()
      }
      if (active()) {
        retryTimer = setTimeout(connect, delay)
        delay = Math.min(delay * 2, 15000)
      }
    }
  }

  void connect()
  return {
    close() {
      closed = true
      clearTimeout(retryTimer)
      clearTimeout(watchdog)
      controller?.abort()
    }
  }
}
