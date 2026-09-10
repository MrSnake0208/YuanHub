import { reactive } from 'vue'

export const PWA_DISMISSED_KEY = 'yuanhub:pwa-install-prompt-dismissed-until:v1'
export const PWA_SESSION_CANCELLED_KEY = 'yuanhub:pwa-install-native-cancelled:v1'
export const PWA_DISMISS_MS = 7 * 24 * 60 * 60 * 1000

let deferredInstallPrompt = null
let initialized = false

export const pwaInstallState = reactive({
  initialized: false,
  installable: false,
  installed: false,
  standalone: false,
  mobile: false,
  ios: false,
  android: false,
  safari: false,
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

function syncEnvironment() {
  pwaInstallState.ios = detectIos()
  pwaInstallState.android = detectAndroid()
  pwaInstallState.safari = detectSafari()
  pwaInstallState.mobile = detectMobileLike()
  pwaInstallState.standalone = detectStandalone()
  pwaInstallState.installed = pwaInstallState.installed || pwaInstallState.standalone
  pwaInstallState.dismissedUntil = readDismissedUntil()
  pwaInstallState.nativeCancelledThisSession = readSessionCancelled()
}

function onBeforeInstallPrompt(event) {
  if (typeof event.preventDefault === 'function') event.preventDefault()
  deferredInstallPrompt = event
  pwaInstallState.installable = true
  pwaInstallState.mobile = detectMobileLike()
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

export function initPwaInstall() {
  if (initialized || typeof window === 'undefined') return pwaInstallState
  initialized = true
  syncEnvironment()
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)
  if (typeof window.matchMedia === 'function') {
    const media = window.matchMedia('(display-mode: standalone)')
    if (typeof media.addEventListener === 'function') media.addEventListener('change', onDisplayModeChanged)
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

export function clearPwaInstallDismissal() {
  pwaInstallState.dismissedUntil = 0
  pwaInstallState.nativeCancelledThisSession = false
  try { localStorage.removeItem(PWA_DISMISSED_KEY) } catch (_) { /* unavailable */ }
  try { sessionStorage.removeItem(PWA_SESSION_CANCELLED_KEY) } catch (_) { /* unavailable */ }
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
