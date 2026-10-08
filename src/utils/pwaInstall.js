import { reactive } from 'vue'
import { TUTORIALS_ENABLED } from '../config/features.js'

export const PWA_DISMISSED_KEY = 'yuanhub:pwa-install-prompt-dismissed-until:v1'
export const PWA_SESSION_CANCELLED_KEY = 'yuanhub:pwa-install-native-cancelled:v1'
export const PWA_AUTO_SUPPRESSED_KEY = 'yuanhub:pwa-install-auto-suppressed:v1'
export const PWA_GUIDE_KEY = 'yuanhub:pwa-install-guide:v1'
export const PWA_DISMISS_MS = 7 * 24 * 60 * 60 * 1000
// 与 src/styles/main.css 中 .mobile-shell 的响应式切换保持一致。
export const PWA_MOBILE_VIEWPORT_QUERY = '(max-width: 1080px)'

let deferredInstallPrompt = null
let initialized = false
let installRequest = null

export const pwaInstallState = reactive({
  initialized: false,
  installable: false,
  installed: false,
  standalone: false,
  // 本浏览器上下文的推广偏好，不代表设备当前安装状态。
  autoSuppressed: false,
  viewportMobile: false,
  mobile: false,
  ios: false,
  android: false,
  safari: false,
  installHelpNeeded: false,
  dismissedUntil: 0,
  nativeCancelledThisSession: false,
  tutorialStarted: false,
  guideActive: false,
  tutorialCompleted: false,
  dismissedForNow: false,
  disableAutoGuide: false,
  phase: 'ready',
  requesting: false
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

function readDismissedUntil() {
  try {
    const value = Number(localStorage.getItem(PWA_DISMISSED_KEY) || 0)
    return Number.isFinite(value) ? value : 0
  } catch (_) {
    return 0
  }
}

function readSessionCancelled() {
  try {
    return sessionStorage.getItem(PWA_SESSION_CANCELLED_KEY) === '1'
  } catch (_) {
    return false
  }
}

function readAutoSuppressed() {
  try {
    return localStorage.getItem(PWA_AUTO_SUPPRESSED_KEY) === '1'
  } catch (_) {
    return false
  }
}

function suppressAutoPrompt() {
  pwaInstallState.autoSuppressed = true
  try { localStorage.setItem(PWA_AUTO_SUPPRESSED_KEY, '1') } catch (_) { /* unavailable */ }
}

function saveGuide() {
  if (!TUTORIALS_ENABLED) return
  const { tutorialStarted, guideActive, tutorialCompleted, dismissedForNow, disableAutoGuide, phase } = pwaInstallState
  try {
    localStorage.setItem(PWA_GUIDE_KEY, JSON.stringify({ tutorialStarted, guideActive, tutorialCompleted, dismissedForNow, disableAutoGuide, phase }))
  } catch (_) { /* unavailable */ }
}

function restoreGuide() {
  if (!TUTORIALS_ENABLED) return
  try {
    const record = JSON.parse(localStorage.getItem(PWA_GUIDE_KEY) || 'null')
    if (!record || typeof record !== 'object') return
    for (const key of ['tutorialStarted', 'guideActive', 'tutorialCompleted', 'dismissedForNow', 'disableAutoGuide']) {
      pwaInstallState[key] = record[key] === true
    }
    if (['ready', 'waiting-for-install', 'dismissed', 'failed', 'manual'].includes(record.phase)) pwaInstallState.phase = record.phase
    else if (record.phase === 'prompting') pwaInstallState.phase = 'waiting-for-install'
    pwaInstallState.guideActive = pwaInstallState.guideActive && pwaInstallState.tutorialStarted && !pwaInstallState.tutorialCompleted
  } catch (_) { /* unavailable */ }
}

function completeGuideFromEvidence() {
  if (!TUTORIALS_ENABLED) return
  if (!pwaInstallState.guideActive || !pwaInstallState.tutorialStarted) return
  if (!pwaInstallState.installed && !pwaInstallState.standalone) return
  pwaInstallState.tutorialCompleted = true
  pwaInstallState.guideActive = false
  pwaInstallState.dismissedForNow = false
  saveGuide()
}

export function refreshPwaInstallStatus() {
  onDisplayModeChanged()
  completeGuideFromEvidence()
}

export function startPwaInstallGuide() {
  if (!TUTORIALS_ENABLED) return
  initPwaInstall()
  refreshPwaInstallStatus()
  pwaInstallState.tutorialStarted = true
  pwaInstallState.guideActive = true
  pwaInstallState.dismissedForNow = false
  // 历史完成记录不是设备当前仍已安装的证据。
  pwaInstallState.tutorialCompleted = false
  if (!pwaInstallState.requesting && !['waiting-for-install', 'failed', 'dismissed'].includes(pwaInstallState.phase)) {
    pwaInstallState.phase = pwaInstallState.installable ? 'ready' : 'manual'
  }
  completeGuideFromEvidence()
  saveGuide()
}

export function closePwaInstallGuide({ disableAutoGuide = false } = {}) {
  if (!TUTORIALS_ENABLED) return
  pwaInstallState.guideActive = false
  pwaInstallState.dismissedForNow = true
  if (disableAutoGuide) pwaInstallState.disableAutoGuide = true
  dismissPwaInstallPrompt()
  saveGuide()
}

export function waitForPwaInstall() {
  if (!TUTORIALS_ENABLED) return
  refreshPwaInstallStatus()
  if (!pwaInstallState.installed) pwaInstallState.phase = 'waiting-for-install'
  saveGuide()
}

export function getPwaInstallGuidance(navigatorLike = typeof navigator !== 'undefined' ? navigator : null) {
  if (detectIos(navigatorLike)) {
    return detectSafari(navigatorLike)
      ? '打开 Safari 的“分享”菜单，选择“添加到主屏幕”；如显示“作为 Web App 打开”，保持开启后点击“添加”。'
      : '请在 Safari 中打开当前 YuanHub 地址，再打开“分享”菜单，选择“添加到主屏幕”。'
  }
  const ua = navigatorLike?.userAgent || ''
  if (/SamsungBrowser|EdgA|OPR|UCBrowser|MiuiBrowser/i.test(ua)) return '当前浏览器没有可确认的一键安装入口或菜单路径。请在 Chrome 中打开当前 YuanHub 地址后继续；更换浏览器不会被记为安装完成。'
  if (/Firefox/i.test(ua) && detectAndroid(navigatorLike)) return '打开 Firefox 菜单 → 安装；如只提供快捷方式，需从桌面打开后再检查运行状态。'
  if (/Chrome/i.test(ua) && detectAndroid(navigatorLike)) return '打开 Chrome 的 ⋮ 菜单 → 安装并创建快捷方式（旧版本为“添加到主屏幕”）→ 安装；如只显示创建快捷方式，请从桌面打开后再检查。'
  return '尚未识别到可确认的安装菜单。请在支持安装的浏览器中打开当前地址；Android 可使用 Chrome，iPhone / iPad 可使用 Safari。'
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
  pwaInstallState.autoSuppressed = readAutoSuppressed()
  if (pwaInstallState.standalone) suppressAutoPrompt()
  pwaInstallState.dismissedUntil = readDismissedUntil()
  pwaInstallState.nativeCancelledThisSession = readSessionCancelled()
}

function onBeforeInstallPrompt(event) {
  if (typeof event.preventDefault === 'function') event.preventDefault()
  if (typeof event.prompt !== 'function') return
  deferredInstallPrompt = event
  pwaInstallState.installable = true
  pwaInstallState.installHelpNeeded = false
  syncMobileEnvironment()
  if (pwaInstallState.phase !== 'waiting-for-install' && !pwaInstallState.requesting) pwaInstallState.phase = 'ready'
  saveGuide()
}

function onAppInstalled() {
  deferredInstallPrompt = null
  pwaInstallState.installable = false
  pwaInstallState.installed = true
  pwaInstallState.phase = 'installed'
  pwaInstallState.standalone = detectStandalone()
  suppressAutoPrompt()
  pwaInstallState.installHelpNeeded = false
  pwaInstallState.nativeCancelledThisSession = false
  try { sessionStorage.removeItem(PWA_SESSION_CANCELLED_KEY) } catch (_) { /* unavailable */ }
  completeGuideFromEvidence()
}

function onDisplayModeChanged() {
  const standalone = detectStandalone()
  pwaInstallState.standalone = standalone
  if (standalone) {
    pwaInstallState.installed = true
    pwaInstallState.phase = 'installed'
    suppressAutoPrompt()
    completeGuideFromEvidence()
  }
}

function onStorageChanged(event) {
  if (event.key !== PWA_AUTO_SUPPRESSED_KEY && event.key !== PWA_DISMISSED_KEY) return
  try {
    if (event.storageArea && event.storageArea !== localStorage) return
  } catch (_) { return /* unavailable */ }
  if (event.key === PWA_AUTO_SUPPRESSED_KEY) pwaInstallState.autoSuppressed = readAutoSuppressed()
  else pwaInstallState.dismissedUntil = readDismissedUntil()
}

function onMobileViewportChanged(event) {
  syncMobileEnvironment(event.matches)
}

export function initPwaInstall() {
  if (initialized || typeof window === 'undefined') return pwaInstallState
  initialized = true
  restoreGuide()
  syncEnvironment()
  completeGuideFromEvidence()
  window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  window.addEventListener('appinstalled', onAppInstalled)
  window.addEventListener('storage', onStorageChanged)
  window.addEventListener('focus', refreshPwaInstallStatus)
  window.addEventListener('pageshow', refreshPwaInstallStatus)
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refreshPwaInstallStatus)
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

function canShowPwaInstallPromotion(now) {
  if (!TUTORIALS_ENABLED) return false
  if (!pwaInstallState.initialized || !pwaInstallState.mobile) return false
  if (pwaInstallState.installed || pwaInstallState.standalone || pwaInstallState.autoSuppressed || pwaInstallState.disableAutoGuide) return false
  if (pwaInstallState.guideActive || pwaInstallState.phase === 'waiting-for-install' || pwaInstallState.requesting) return false
  if (pwaInstallState.dismissedUntil > now) return false
  if (pwaInstallState.nativeCancelledThisSession) return false
  return true
}

export function shouldShowPwaInstallPrompt(now = Date.now()) {
  return canShowPwaInstallPromotion(now) && pwaInstallState.installable && !!deferredInstallPrompt
}

// 只供当前组件已发起的失败操作继续展示指南，不作为首次自动邀请。
export function shouldShowPwaInstallRecovery(now = Date.now()) {
  return canShowPwaInstallPromotion(now) && pwaInstallState.installHelpNeeded
}

export function dismissPwaInstallPrompt(now = Date.now()) {
  const until = now + PWA_DISMISS_MS
  pwaInstallState.dismissedUntil = until
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

export function requestPwaInstall() {
  if (installRequest) return installRequest
  if (!deferredInstallPrompt || !pwaInstallState.installable) {
    pwaInstallState.installHelpNeeded = false
    pwaInstallState.phase = 'manual'
    saveGuide()
    return Promise.resolve({ outcome: 'unavailable' })
  }
  const promptEvent = deferredInstallPrompt
  deferredInstallPrompt = null
  pwaInstallState.installable = false
  pwaInstallState.requesting = true
  pwaInstallState.phase = 'prompting'
  saveGuide()
  installRequest = (async () => {
    try {
      await promptEvent.prompt()
      const choice = await promptEvent.userChoice
      const outcome = choice?.outcome || 'dismissed'
      if (!pwaInstallState.installed) pwaInstallState.phase = outcome === 'accepted' ? 'waiting-for-install' : 'dismissed'
      pwaInstallState.installHelpNeeded = false
      pwaInstallState.nativeCancelledThisSession = outcome !== 'accepted' && !pwaInstallState.installed
      try {
        if (pwaInstallState.nativeCancelledThisSession) sessionStorage.setItem(PWA_SESSION_CANCELLED_KEY, '1')
        else sessionStorage.removeItem(PWA_SESSION_CANCELLED_KEY)
      } catch (_) { /* unavailable */ }
      saveGuide()
      return { outcome }
    } catch (error) {
      // 系统/OEM 权限不可由网页读取；只有真实调用失败才进入排障。
      pwaInstallState.installHelpNeeded = !pwaInstallState.installed
      if (!pwaInstallState.installed) pwaInstallState.phase = 'failed'
      pwaInstallState.nativeCancelledThisSession = false
      try { sessionStorage.removeItem(PWA_SESSION_CANCELLED_KEY) } catch (_) { /* unavailable */ }
      saveGuide()
      return { outcome: 'failed', error }
    }
  })().finally(() => {
    pwaInstallState.requesting = false
    installRequest = null
    completeGuideFromEvidence()
  })
  return installRequest
}
