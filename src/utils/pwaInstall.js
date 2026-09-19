import { reactive } from 'vue'

export const PWA_DISMISSED_KEY = 'yuanhub:pwa-install-prompt-dismissed-until:v1'
export const PWA_SESSION_CANCELLED_KEY = 'yuanhub:pwa-install-native-cancelled:v1'
export const PWA_DISMISS_MS = 7 * 24 * 60 * 60 * 1000
// 与 src/styles/main.css 中 .mobile-shell 的响应式切换保持一致。
export const PWA_MOBILE_VIEWPORT_QUERY = '(max-width: 1080px)'

let deferredInstallPrompt = null
let initialized = false

export const pwaInstallState = reactive({
  initialized: false,
  installable: false,
  installed: false,
  standalone: false,
  viewportMobile: false,
  mobile: false,
  ios: false,
  android: false,
  safari: false,
  installHelpNeeded: false,
  dismissedUntil: 0,
  nativeCancelledThisSession: false
})

export function detectIos(navigatorLike = typeof navigator !== 'undefined' ? navigator : null) {
  if (!navigatorLike) return false
  const ua = navigatorLike.userAgent || ''
  const platform = navigatorLike.platform || ''
  return /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && Number(navigatorLike.maxTouchPoints || 0) > 1)
}

export function detectAndroid(navigatorLike = typeof navigator !== 'undefined' ? navigator : null) {
  return !!navigatorLike && /Android/i.test(navigatorLike.userAgent || '')
}

export function detectSafari(navigatorLike = typeof navigator !== 'undefined' ? navigator : null) {
  if (!navigatorLike) return false
  const ua = navigatorLike.userAgent || ''
  return /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|Chrome|Chromium|Android/i.test(ua)
}

export function detectMobileLike(navigatorLike = typeof navigator !== 'undefined' ? navigator : null) {
  if (!navigatorLike) return false
  const ua = navigatorLike.userAgent || ''
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true
  return detectIos(navigatorLike)
}

export function detectMobileViewport(windowLike = typeof window !== 'undefined' ? window : null) {
  if (!windowLike || typeof windowLike.matchMedia !== 'function') return false
  return windowLike.matchMedia(PWA_MOBILE_VIEWPORT_QUERY).matches
}

export function detectStandalone(windowLike = typeof window !== 'undefined' ? window : null) {
  if (!windowLike) return false
  const displayStandalone = typeof windowLike.matchMedia === 'function'
    ? windowLike.matchMedia('(display-mode: standalone)').matches
    : false
  return displayStandalone || windowLike.navigator?.standalone === true
}

function readDismissedUntil(storage = typeof localStorage !== 'undefined' ? localStorage : null) {
  if (!storage) return 0
  try {
    const value = Number(storage.getItem(PWA_DISMISSED_KEY) || 0)
    return Number.isFinite(value) ? value : 0
  } catch (_) {
    return 0
  }
}

function readSessionCancelled(storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null) {
  if (!storage) return false
  try {
    return storage.getItem(PWA_SESSION_CANCELLED_KEY) === '1'
  } catch (_) {
    return false
  }
}

function syncMobileEnvironment(viewportMobile = detectMobileViewport()) {
  pwaInstallState.ios = detectIos()
  pwaInstallState.android = detectAndroid()
  pwaInstallState.safari = detectSafari()
  pwaInstallState.viewportMobile = Boolean(viewportMobile)
  // UI 是否处于移动体验优先看实时 viewport；UA 只作为真实移动设备横屏等能力兜底。
  pwaInstallState.mobile = pwaInstallState.viewportMobile || detectMobileLike()
}

function syncEnvironment() {
  syncMobileEnvironment()
  pwaInstallState.standalone = detectStandalone()
  pwaInstallState.installed = pwaInstallState.installed || pwaInstallState.standalone
  pwaInstallState.dismissedUntil = readDismissedUntil()
  pwaInstallState.nativeCancelledThisSession = readSessionCancelled()
}

function onBeforeInstallPrompt(event) {
  if (typeof event.preventDefault === 'function') event.preventDefault()
  deferredInstallPrompt = event
  pwaInstallState.installable = true
  pwaInstallState.installHelpNeeded = false
  syncMobileEnvironment()
}

function onAppInstalled() {
  deferredInstallPrompt = null
  pwaInstallState.installable = false
  pwaInstallState.installed = true
  pwaInstallState.standalone = true
  pwaInstallState.installHelpNeeded = false
  pwaInstallState.nativeCancelledThisSession = false
  try { sessionStorage.removeItem(PWA_SESSION_CANCELLED_KEY) } catch (_) { /* unavailable */ }
}

function onDisplayModeChanged() {
  const standalone = detectStandalone()
  pwaInstallState.standalone = standalone
  if (standalone) pwaInstallState.installed = true
}

function onMobileViewportChanged(event) {
  syncMobileEnvironment(event.matches)
}

export function initPwaInstall() {
  if (initialized || typeof window === 'undefined') return pwaInstallState
  initialized = true
  syncEnvironment()
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)
  if (typeof window.matchMedia === 'function') {
    const displayModeMedia = window.matchMedia('(display-mode: standalone)')
    if (typeof displayModeMedia.addEventListener === 'function') {
      displayModeMedia.addEventListener('change', onDisplayModeChanged)
    }
    const mobileMedia = window.matchMedia(PWA_MOBILE_VIEWPORT_QUERY)
    if (typeof mobileMedia.addEventListener === 'function') {
      mobileMedia.addEventListener('change', onMobileViewportChanged)
    }
  }
  pwaInstallState.initialized = true
  return pwaInstallState
}

export function shouldShowPwaInstallPrompt(now = Date.now()) {
  if (!pwaInstallState.initialized || !pwaInstallState.mobile) return false
  if (pwaInstallState.installed || pwaInstallState.standalone) return false
  if (pwaInstallState.dismissedUntil > now) return false
  if (pwaInstallState.nativeCancelledThisSession) return false
  return pwaInstallState.installable || pwaInstallState.ios || pwaInstallState.android || pwaInstallState.installHelpNeeded
}

export function dismissPwaInstallPrompt(now = Date.now()) {
  const until = now + PWA_DISMISS_MS
  pwaInstallState.dismissedUntil = until
  pwaInstallState.installHelpNeeded = false
  try { localStorage.setItem(PWA_DISMISSED_KEY, String(until)) } catch (_) { /* unavailable */ }
  return until
}

export function clearPwaInstallDismissal() {
  pwaInstallState.dismissedUntil = 0
  pwaInstallState.installHelpNeeded = false
  pwaInstallState.nativeCancelledThisSession = false
  try { localStorage.removeItem(PWA_DISMISSED_KEY) } catch (_) { /* unavailable */ }
  try { sessionStorage.removeItem(PWA_SESSION_CANCELLED_KEY) } catch (_) { /* unavailable */ }
}

export async function requestPwaInstall() {
  if (!deferredInstallPrompt || !pwaInstallState.installable) {
    pwaInstallState.installHelpNeeded = true
    return { outcome: 'unavailable' }
  }
  const promptEvent = deferredInstallPrompt
  deferredInstallPrompt = null
  pwaInstallState.installable = false
  try {
    await promptEvent.prompt()
    const choice = await promptEvent.userChoice
    const outcome = choice?.outcome || 'dismissed'
    if (outcome === 'accepted') {
      pwaInstallState.installed = true
      pwaInstallState.installHelpNeeded = false
      pwaInstallState.nativeCancelledThisSession = false
    } else {
      pwaInstallState.installHelpNeeded = false
      pwaInstallState.nativeCancelledThisSession = true
      try { sessionStorage.setItem(PWA_SESSION_CANCELLED_KEY, '1') } catch (_) { /* unavailable */ }
    }
    return { outcome }
  } catch (error) {
    // 部分 Android 浏览器会因为系统/OEM 的“添加桌面快捷方式”权限被拒绝而失败。
    // 网页无法直接读取或开启这项 App 级权限，因此把失败交给 UI 展示设置引导，而不是静默抛错。
    pwaInstallState.installHelpNeeded = true
    pwaInstallState.nativeCancelledThisSession = false
    try { sessionStorage.removeItem(PWA_SESSION_CANCELLED_KEY) } catch (_) { /* unavailable */ }
    return { outcome: 'failed', error }
  }
}
