// 全局版本检测：比较“当前构建注入的产品版本”与前端 deploy-meta.json 的 version。
// 非关键功能：任何失败都静默，下一次检查再试，绝不阻塞业务或改动登录态。
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { productVersion } from '../config/buildInfo.js'
import { getFrontendDeployMeta } from '../api/system.js'
import {
  MIN_VERSION_CHECK_GAP_MS,
  VERSION_CHECK_INTERVAL_MS,
  hasNewVersion,
  isVersionCheckEnabled,
  normalizeVersion
} from '../utils/versionCheck.js'

/** 刷新页面：只重新加载最新前端资源，不清除任何本地数据。 */
export function reloadForNewVersion() {
  if (typeof window !== 'undefined' && window.location) window.location.reload()
}

export function useVersionUpdate({
  enabled = isVersionCheckEnabled(),
  intervalMs = VERSION_CHECK_INTERVAL_MS,
  minGapMs = MIN_VERSION_CHECK_GAP_MS,
  fetcher = getFrontendDeployMeta,
  reloader = reloadForNewVersion,
  now = () => Date.now()
} = {}) {
  const currentVersion = ref(normalizeVersion(productVersion))
  const latestVersion = ref('')
  const updateAvailable = ref(false)
  const checking = ref(false)

  let timer = null
  let lastCheckAt = 0
  let disposed = false

  function stopPolling() {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }

  /** Release deploy-meta.json 的 version 是当前线上前端产品版本。 */
  function readLatestVersion(payload) {
    if (!payload || typeof payload !== 'object') return ''
    return normalizeVersion(payload.version)
  }

  async function checkForUpdate({ force = false } = {}) {
    // 已发现更新 / 正在请求 / 已卸载时不再重复请求。
    if (!enabled || disposed || updateAvailable.value || checking.value) return
    const timestamp = now()
    if (!force && timestamp - lastCheckAt < minGapMs) return
    lastCheckAt = timestamp
    checking.value = true
    try {
      const latest = readLatestVersion(await fetcher())
      if (!latest) return
      latestVersion.value = latest
      if (hasNewVersion(currentVersion.value, latest)) {
        updateAvailable.value = true
        // 用户已经知道需要刷新，停止周期轮询避免无意义请求。
        stopPolling()
      }
    } catch (_) {
      // 版本检测失败不影响业务：静默忽略，等待下一次检查。
    } finally {
      checking.value = false
    }
  }

  function onVisibilityChange() {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      void checkForUpdate()
    }
  }

  onMounted(function () {
    if (!enabled) return
    void checkForUpdate({ force: true })
    timer = setInterval(function () {
      void checkForUpdate()
    }, intervalMs)
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onVisibilityChange)
    }
  })

  onBeforeUnmount(function () {
    disposed = true
    stopPolling()
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  })

  function reload() {
    reloader()
  }

  return { currentVersion, latestVersion, updateAvailable, checking, checkForUpdate, reload }
}
