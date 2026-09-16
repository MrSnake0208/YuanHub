import { reactive } from 'vue'

export const PWA_DISMISSED_KEY = 'yuanhub:pwa-install-prompt-dismissed-until:v1'
export const PWA_SESSION_CANCELLED_KEY = 'yuanhub:pwa-install-native-cancelled:v1'
export const PWA_DISMISS_MS = 7 * 24 * 60 * 60 * 1000
// 与 promo-site/src/App.vue 的主移动布局 breakpoint 保持一致。
export const PWA_MOBILE_VIEWPORT_QUERY = '(max-width: 780px)'

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
  syncMobileEnvironment()
}

function onAppInstalled() {
  deferredInstallPrompt = null
  pwaInstallState.installable = false
  pwaInstallState.installed = true
  pwaInstallState.standalone = true
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
  return pwaInstallState.installable || pwaInstallState.ios || pwaInstallState.android
}

export function dismissPwaInstallPrompt(now = Date.now()) {
  const until = now + PWA_DISMISS_MS
  pwaInstallState.dismissedUntil = until
  try { localStorage.setItem(PWA_DISMISSED_KEY, String(until)) } catch (_) { /* unavailable */ }
  return until
}

export async function requestPwaInstall() {
  if (!deferredInstallPrompt || !pwaInstallState.installable) {
    return { outcome: 'unavailable' }
  }
  const promptEvent = deferredInstallPrompt
  deferredInstallPrompt = null
  pwaInstallState.installable = false
  await promptEvent.prompt()
  const choice = await promptEvent.userChoice
  const outcome = choice?.outcome || 'dismissed'
  if (outcome === 'accepted') {
    pwaInstallState.installed = true
    pwaInstallState.nativeCancelledThisSession = false
  } else {
    pwaInstallState.nativeCancelledThisSession = true
    try { sessionStorage.setItem(PWA_SESSION_CANCELLED_KEY, '1') } catch (_) { /* unavailable */ }
  }
  return { outcome }
}
