// 测试用 localStorage 替身。
//
// store/auth.js 在「模块加载期」就会读取 localStorage 的 'yh_auth' 恢复登录态，
// 所以调用方必须在 import 该模块之前安装本替身，例如：
//
//   const storage = installAuthStorage({ accessToken: 'expired', ... })
//   const { auth } = await import('../src/store/auth.js')
//
// Node 的 node:test 环境默认没有 localStorage；没有替身时 persist() 会抛错，
// 导致 token 刷新被静默当成失败，测试结果失真。
export const AUTH_STORAGE_KEY = 'yh_auth'

export function createMemoryStorage(initial = {}) {
  const map = new Map(
    Object.entries(initial).map(function ([key, value]) { return [String(key), String(value)] })
  )
  return {
    getItem(key) {
      const name = String(key)
      return map.has(name) ? map.get(name) : null
    },
    setItem(key, value) { map.set(String(key), String(value)) },
    removeItem(key) { map.delete(String(key)) },
    clear() { map.clear() },
    key(index) { return Array.from(map.keys())[index] ?? null },
    get length() { return map.size },
    snapshot() { return Object.fromEntries(map) }
  }
}

export function seedAuthState(storage, { accessToken = '', refreshToken = '', userInfo = null } = {}) {
  storage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ accessToken, refreshToken, userInfo }))
  return storage
}

export function installAuthStorage({ accessToken = '', refreshToken = '', userInfo = null } = {}) {
  const storage = createMemoryStorage()
  if (accessToken || refreshToken || userInfo) {
    seedAuthState(storage, { accessToken, refreshToken, userInfo })
  }
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: storage })
  return {
    storage,
    restore() {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
      else delete globalThis.localStorage
    }
  }
}
