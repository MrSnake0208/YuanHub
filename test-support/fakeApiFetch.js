// node:test 用的极简假后端：按 (method, path, bearer token) 路由响应。
// 只服务鉴权 / 刷新 / 超时相关的回归测试，不模拟真实后端业务。
export function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

export function unauthorized(message = 'token expired') {
  return jsonResponse({ status_code: 401, message }, 401)
}

export function forbidden(message = 'forbidden', code = '') {
  return jsonResponse(code ? { status_code: 403, message, error: { code, message } } : { status_code: 403, message }, 403)
}

export function ok(data) {
  return jsonResponse({ status_code: 200, message: 'ok', data })
}

export function bearerToken(options = {}) {
  const value = options.headers && options.headers.Authorization
  return typeof value === 'string' ? value.replace(/^Bearer\s+/i, '') : ''
}

export function pathOf(url) {
  const text = String(url)
  const index = text.indexOf('://')
  if (index < 0) return text.split('?')[0]
  const rest = text.slice(index + 3)
  const slash = rest.indexOf('/')
  return (slash < 0 ? '/' : rest.slice(slash)).split('?')[0]
}

/**
 * routes: [{ method, path, respond(context) }]，path 为精确路径匹配。
 * context: { method, path, token, url, call, options, calls }
 */
export function installFetch(routes, { previous = globalThis.fetch } = {}) {
  const calls = []
  globalThis.fetch = async function (url, options = {}) {
    const method = String(options.method || 'GET').toUpperCase()
    const path = pathOf(url)
    const token = bearerToken(options)
    const call = { url: String(url), path, method, token, options }
    calls.push(call)
    const route = routes.find(function (candidate) {
      return candidate.method === method && candidate.path === path
    })
    if (!route) throw new Error('unexpected request: ' + method + ' ' + path)
    return route.respond({ method, path, token, url: String(url), call, options, calls })
  }
  return {
    calls,
    count(path, method = 'GET') {
      return calls.filter(function (call) { return call.path === path && call.method === method }).length
    },
    tokensFor(path, method = 'GET') {
      return calls.filter(function (call) { return call.path === path && call.method === method }).map(function (call) { return call.token })
    },
    restore() { globalThis.fetch = previous }
  }
}

export function abortError(message = 'The operation was aborted.') {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}

/** fetch 永远不 settle，除非调用方传入了 signal 且被 abort。 */
export function hangingFetch() {
  return function (url, options = {}) {
    return new Promise(function (_resolve, reject) {
      const signal = options.signal
      if (!signal) return
      if (signal.aborted) return reject(abortError())
      signal.addEventListener('abort', function () { reject(abortError()) })
    })
  }
}

export function delay(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms) })
}

/** 给可能死锁的 Promise 加硬上限，避免测试挂死而不是失败。 */
export function withDeadline(promise, ms = 3000, label = '操作') {
  let timer = null
  const guard = new Promise(function (_resolve, reject) {
    timer = setTimeout(function () {
      reject(new Error(label + '未在 ' + ms + 'ms 内结束（疑似 Promise 死锁）'))
    }, ms)
  })
  return Promise.race([promise, guard]).finally(function () { if (timer) clearTimeout(timer) })
}
