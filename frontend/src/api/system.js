// 前端部署元数据接口（用于全局版本更新检测）。
// deploy-meta.json 由前端 Release 在原子切换前写入，与当前线上静态资源同源，
// 因此它才是“用户现在应该运行哪个前端版本”的权威事实来源。
import { createTimeoutSignal } from '../utils/requestTimeout.js'

export const VERSION_META_TIMEOUT_MS = 8000

export async function getFrontendDeployMeta({ timeoutMs = VERSION_META_TIMEOUT_MS, now = Date.now } = {}) {
  const timeout = createTimeoutSignal(timeoutMs)
  const url = '/deploy-meta.json?versionCheck=' + encodeURIComponent(String(now()))
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
      signal: timeout.signal
    })
    if (!response.ok) throw new Error('版本信息请求失败: HTTP ' + response.status)
    const payload = await response.json()
    return payload && typeof payload === 'object' ? payload : {}
  } finally {
    timeout.cancel()
  }
}
