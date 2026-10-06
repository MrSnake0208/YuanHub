import { driver } from 'driver.js'
import { useOnboardingStore } from '../stores/onboarding.js'
import { NAVIGATION_SIGNAL } from './navigationCancellation.js'

const FIRST_STEP_ID = 'welcome'
const TARGET_TIMEOUT = 5000
const LAYOUT_TIMEOUT = 1500

export const ONBOARDING_STEPS = [
  {
    id: FIRST_STEP_ID,
    title: '欢迎来到 YuanHub',
    description: '先认识最常用的 5 件事：创建游戏子账号、查看今天要做什么、管理密探、追踪库存，以及用 MaaYuan 自动同步。整个教程可以随时跳过，也能之后重看。',
    side: 'bottom',
    align: 'center'
  },
  {
    id: 'account-create',
    route: '/user/profile',
    target: 'account-create',
    title: '先确认子账号',
    description: '在“游戏账号”摘要确认当前游戏子账号；点击“管理游戏账号”查看已有账号，需要新建时点击弹窗中的“新建账号”。尚无账号时直接点击“创建游戏账号”，选择所属游戏并填写名称后点击“创建”。密探、库存、星石、奖励流水和连接码都会归属到这个子账号。',
    side: 'bottom',
    align: 'start'
  },
  {
    id: 'today-overview',
    route: '/',
    target: 'today-overview',
    title: '先看「今日一览」',
    description: '先确认顶部的当前游戏账号，可以直接切换。这里会显示已开放的活动日程、个人订阅和当前账号的数据状态；尚未建档时会引导登录、创建账号和补齐数据，已有数据不需要重复录入。常用工具在页面后部。',
    side: 'bottom',
    align: 'start'
  },
  {
    id: 'operator-workspace',
    route: '/operator',
    target: 'operator-workspace',
    title: '管理密探档案',
    description: '这里先确认当前子账号与游戏版本，再维护密探养成进度。展开“分享与数据交换”后，可以导入、导出数据或分享 BOX；子账号统一从“账号与连接码”管理。',
    side: 'bottom',
    align: 'start'
  },
  {
    id: 'inventory-workspace',
    route: '/inventory',
    target: 'inventory-workspace',
    title: '追踪库存变化',
    description: '在这里切换背包道具与密探心纸，查看库存、记录变化和统计结果。账号会与密探页保持一致。',
    side: 'bottom',
    align: 'start'
  },
  {
    id: 'maayuan-sync',
    route: '/user/profile',
    target: 'maayuan-sync',
    title: '推荐：连接 MaaYuan 自动同步',
    description: '完成或退出教程后，点击“连接 MaaYuan”查看账号选择与权限说明。确认账号与权限并主动提交后才会生成连接码，再把连接码粘贴到 MaaYuan；之后可按任务自动同步派遣 / 情报奖励、密探信息和背包道具。星石网页端已可导入截图识别与整理，MaaYuan 星石自动采集仍在接入中。<br><br>以后也可以从导航中的“账号与连接码”回来管理；如果还没有子账号，点击“创建游戏账号”即可原地创建。（可选步骤，也可以手动录入数据）',
    side: 'top',
    align: 'start'
  },
  {
    id: 'replay-entry',
    target: 'replay-entry',
    mobileTarget: 'replay-menu',
    title: '忘了也没关系',
    description: '以后需要复习时，打开导航底部的“更多”，再选择“新手教程”，就能重新启动教程，不用记住每个页面的位置。',
    mobileDescription: '以后需要复习时，先点击顶部的“打开导航”按钮，再打开“更多”，选择“新手教程”，就能重新查看，不用记住每个页面的位置。',
    side: 'right',
    align: 'center'
  }
]

let driverInstance = null
let operation = null
let operationController = null
let preserveStateOnDestroy = false
let removeRouteHook = null
let targetResizeObserver = null
let removeTargetMediaListener = null
let returnFocus = null
let activeNavigation = null

function isVisible(element) {
  if (!element) return false
  if (element.matches?.('[hidden], [inert], [aria-hidden="true"]')) return false
  if (typeof Element !== 'undefined' && element instanceof Element && ['hidden', 'collapse'].includes(getComputedStyle(element).visibility)) return false
  if (element.offsetWidth > 0 || element.offsetHeight > 0) return true
  if (typeof element.getClientRects === 'function') return element.getClientRects().length > 0
  return true
}

function findTarget(target) {
  if (typeof document === 'undefined' || !target) return null
  const elements = Array.from(document.querySelectorAll(`[data-tour="${target}"]`))
  return elements.find(isVisible) || null
}

function isMobileTour() {
  return typeof window !== 'undefined' && window.matchMedia?.('(max-width: 1080px)').matches === true
}

function targetForStep(step) {
  return isMobileTour() && step.mobileTarget ? step.mobileTarget : step.target
}

export function waitForElement(target, timeout = TARGET_TIMEOUT, signal) {
  if (signal?.aborted) return Promise.resolve(null)
  const existing = findTarget(target)
  if (existing) return Promise.resolve(existing)
  if (typeof document === 'undefined') return Promise.resolve(null)

  return new Promise(resolve => {
    let observer = null
    let settled = false
    const finish = element => {
      if (settled) return
      settled = true
      if (observer) observer.disconnect()
      globalThis.clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      resolve(element || null)
    }
    const abort = () => finish(null)
    const timer = globalThis.setTimeout(() => finish(findTarget(target)), timeout)
    signal?.addEventListener('abort', abort, { once: true })

    if (typeof MutationObserver === 'undefined') return
    observer = new MutationObserver(() => {
      const element = findTarget(target)
      if (element) finish(element)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
  })
}

function revealTourTarget(element) {
  const revealElement = element?.closest?.('.rv')
  if (revealElement) revealElement.classList.add('in')
}

function waitForLayoutFrames(count = 1, signal) {
  if (count <= 0 || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return Promise.resolve()
  }
  return new Promise(resolve => {
    let frame = null
    const finish = () => {
      window.cancelAnimationFrame(frame)
      signal?.removeEventListener('abort', finish)
      resolve()
    }
    const next = () => {
      if (signal?.aborted || --count <= 0) finish()
      else frame = window.requestAnimationFrame(next)
    }
    if (signal?.aborted) return finish()
    signal?.addEventListener('abort', finish, { once: true })
    frame = window.requestAnimationFrame(next)
  })
}

function waitForStableTarget(element, signal) {
  return new Promise(resolve => {
    let frame = null
    let previous = null
    let stableFrames = 0
    let settled = false
    const finish = stable => {
      if (settled) return
      settled = true
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
      signal.removeEventListener('abort', abort)
      resolve(stable)
    }
    const abort = () => finish(false)
    const timer = window.setTimeout(() => finish(false), LAYOUT_TIMEOUT)
    const sample = () => {
      if (signal.aborted || !element.isConnected) return finish(false)
      const rect = element.getBoundingClientRect()
      const current = [rect.x, rect.y, rect.width, rect.height]
      const unchanged = previous && current.every((value, index) => Math.abs(value - previous[index]) <= 0.1)
      stableFrames = rect.width > 0 && rect.height > 0 && unchanged ? stableFrames + 1 : 0
      previous = current
      if (stableFrames >= 3) return finish(true)
      frame = window.requestAnimationFrame(sample)
    }
    if (signal.aborted) return finish(false)
    signal.addEventListener('abort', abort, { once: true })
    frame = window.requestAnimationFrame(sample)
  })
}

function stopTargetObserver() {
  targetResizeObserver?.disconnect()
  targetResizeObserver = null
  removeTargetMediaListener?.()
  removeTargetMediaListener = null
}

function cancelOperation() {
  const controller = operationController
  operationController?.abort()
  if (activeNavigation && activeNavigation.signal === controller?.signal) {
    const { router, record, signal } = activeNavigation
    if (record.meta[NAVIGATION_SIGNAL] === signal) delete record.meta[NAVIGATION_SIGNAL]
    activeNavigation = null
    // 对当前地址的重复导航会使Vue Router废弃尚未完成的旧push，不改用户页面。
    void router.replace(router.currentRoute.value.fullPath).catch(() => {})
  }
  operationController = null
  operation = null
}

function restoreTourFocus() {
  const opener = returnFocus
  returnFocus = null
  if (typeof document === 'undefined') return
  // Driver.js 自身的销毁焦点恢复完成后再选择仍可达的入口。
  queueMicrotask(() => {
    if (currentStore().active) return
    const target = opener?.isConnected && opener !== document.body && isVisible(opener) && !opener.disabled
      ? opener : document.querySelector('main') || document.body
    if (target.tabIndex < 0) target.setAttribute('tabindex', '-1')
    target.focus({ preventScroll: true })
  })
}

function bringTargetIntoView(element) {
  if (!element || typeof window === 'undefined' || typeof element.getBoundingClientRect !== 'function') return
  const rect = element.getBoundingClientRect()
  const viewportHeight = window.innerHeight || document.documentElement?.clientHeight || 0
  const viewportWidth = window.innerWidth || document.documentElement?.clientWidth || 0
  if (!viewportHeight || !viewportWidth) return

  const verticalMargin = Math.min(96, Math.max(24, viewportHeight * 0.12))
  const horizontalMargin = Math.min(48, Math.max(16, viewportWidth * 0.06))
  const outsideSafeViewport =
    rect.top < verticalMargin ||
    rect.bottom > viewportHeight - verticalMargin ||
    rect.left < horizontalMargin ||
    rect.right > viewportWidth - horizontalMargin

  if (outsideSafeViewport && typeof element.scrollIntoView === 'function') {
    element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' })
  }
}

function stepIndex(stepId) {
  return ONBOARDING_STEPS.findIndex(step => step.id === stepId)
}

function currentStore() {
  return useOnboardingStore().initialize()
}

function destroyDriver(preserveState = false) {
  stopTargetObserver()
  if (!driverInstance) return
  preserveStateOnDestroy = preserveState
  const current = driverInstance
  driverInstance = null
  try {
    current.destroy()
  } finally {
    preserveStateOnDestroy = false
  }
}

function createDriver(router) {
  const store = currentStore()
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  const instance = driver({
    animate: !reduceMotion,
    allowClose: true,
    allowScroll: true,
    disableActiveInteraction: true,
    overlayColor: '#493B2C',
    overlayOpacity: 0.52,
    popoverClass: 'yuanhub-tour',
    progressText: '第 {{current}} / {{total}} 步',
    nextBtnText: '下一步',
    prevBtnText: '上一步',
    doneBtnText: '完成',
    showProgress: true,
    smoothScroll: !reduceMotion,
    stagePadding: 10,
    stageRadius: 14,
    steps: tourSteps(),
    onNextClick: (_element, _step, options) => {
      void moveToIndex(router, (options.index ?? 0) + 1)
    },
    onPrevClick: (_element, _step, options) => {
      void moveToIndex(router, (options.index ?? 0) - 1)
    },
    onDoneClick: () => {
      if (operation) return
      store.complete()
      destroyOnboardingTour()
    },
    onCloseClick: () => {
      destroyOnboardingTour()
    },
    onPopoverRender: popover => {
      popover.closeButton.setAttribute('aria-label', '跳过新手教程')
      popover.closeButton.title = '跳过新手教程'
    },
    onDestroyed: () => {
      const preserve = preserveStateOnDestroy
      preserveStateOnDestroy = false
      if (driverInstance === instance) driverInstance = null
      stopTargetObserver()
      if (!preserve) {
        cancelOperation()
        if (store.active) store.skip()
        restoreTourFocus()
      }
    }
  })
  driverInstance = instance
  return instance
}

function tourSteps(unavailableStepId = null, waiting = false) {
  return ONBOARDING_STEPS.map(step => ({
    element: step.target && step.id !== unavailableStepId ? () => findTarget(targetForStep(step)) : undefined,
    popover: {
      title: step.title,
      description: waiting && step.id === unavailableStepId
        ? '正在准备这个入口…你可以随时关闭教程，之后从导航中重新查看。'
        : (isMobileTour() && step.mobileDescription ? step.mobileDescription : step.description)
          + (step.id === unavailableStepId ? '<br><br>暂时无法定位这个入口，可能仍在加载或当前页面没有此功能。你可以继续下一步、返回上一步，或关闭教程后再重看。' : ''),
      side: step.side || 'bottom',
      align: step.align || 'start',
      ...(waiting && step.id === unavailableStepId ? { disableButtons: ['next', 'previous'] } : {})
    }
  }))
}

async function showStep(router, index, signal) {
  const store = currentStore()
  if (signal.aborted || !store.active) return false
  stopTargetObserver()
  const step = ONBOARDING_STEPS[index]
  if (!step) {
    store.complete()
    destroyOnboardingTour()
    return false
  }

  store.updateStep(step.id)
  // 延迟仅用于避免准备提示闪烁；是否高亮仍由真实几何稳定决定。
  const waitingTimer = window.setTimeout(() => {
    if (signal.aborted || !store.active) return
    const instance = driverInstance?.isActive() ? driverInstance : createDriver(router)
    instance.setConfig({ ...instance.getConfig(), steps: tourSteps(step.id, true) })
    instance.drive(index)
  }, 200)
  const clearWaiting = () => window.clearTimeout(waitingTimer)
  signal.addEventListener('abort', clearWaiting, { once: true })
  let targetElement = null
  try {
    if (step.route && router.currentRoute.value.path !== step.route) {
      destroyDriver(true)
      const destination = router.resolve(step.route)
      const record = destination.matched.at(-1)
      if (!record) throw new Error('Tutorial route is unavailable')
      // resolve会复制meta到本次to；晚到redirectedFrom因此保留自己的signal。
      record.meta[NAVIGATION_SIGNAL] = signal
      const removeCancelledRedirectGuard = router.beforeEach(to => {
        if (to.redirectedFrom?.meta?.[NAVIGATION_SIGNAL]?.aborted) return false
      })
      const navigation = { router, signal, record, target: destination.fullPath }
      activeNavigation = navigation
      try {
        await router.push(step.route)
      } finally {
        removeCancelledRedirectGuard()
        if (record.meta[NAVIGATION_SIGNAL] === signal) delete record.meta[NAVIGATION_SIGNAL]
        if (activeNavigation === navigation) activeNavigation = null
      }
      if (signal.aborted || !store.active) return false
      // 权限守卫可能把目标路由重定向到登录或资格恢复页。
      if (router.currentRoute.value.path !== step.route) {
        destroyOnboardingTour()
        return false
      }
      await waitForLayoutFrames(1, signal)
    }
    if (signal.aborted || !store.active) return false
    targetElement = step.target ? await waitForElement(targetForStep(step), TARGET_TIMEOUT, signal) : null
    if (signal.aborted || !store.active) return false
    revealTourTarget(targetElement)
    bringTargetIntoView(targetElement)
    if (targetElement) {
      const stable = await waitForStableTarget(targetElement, signal)
      if (!stable) targetElement = null
    }
  } finally {
    clearWaiting()
    signal.removeEventListener('abort', clearWaiting)
  }
  if (signal.aborted || !store.active) return false

  const instance = driverInstance?.isActive() ? driverInstance : createDriver(router)
  instance.setConfig({ ...instance.getConfig(), steps: tourSteps(step.target && !targetElement ? step.id : null) })
  instance.drive(index)
  if (step.mobileTarget) {
    const media = window.matchMedia?.('(max-width: 1080px)')
    const retarget = () => {
      void (operation || Promise.resolve()).then(() => {
        if (driverInstance === instance && store.activeStepId === step.id && store.active) void moveToIndex(router, index)
      })
    }
    if (media?.addEventListener) {
      media.addEventListener('change', retarget)
      removeTargetMediaListener = () => media.removeEventListener('change', retarget)
    }
  }
  if (targetElement && typeof ResizeObserver !== 'undefined') {
    targetResizeObserver = new ResizeObserver(() => {
      if (driverInstance === instance && instance.isActive()) instance.refresh?.()
    })
    targetResizeObserver.observe(targetElement)
  }
  await waitForLayoutFrames(2, signal)
  if (signal.aborted || !store.active) return false
  instance.refresh?.()
  return true
}

function run(operationCallback) {
  if (operation) return operation
  const controller = new AbortController()
  operationController = controller
  const pending = Promise.resolve()
    .then(() => operationCallback(controller.signal))
    .catch(() => {
      if (controller.signal.aborted) return false
      const store = currentStore()
      if (store.active) store.skip()
      destroyDriver()
      return false
    })
    .finally(() => {
      if (operation === pending) operation = null
      if (operationController === controller) operationController = null
    })
  operation = pending
  return pending
}

function moveToIndex(router, index) {
  if (index < 0) return Promise.resolve(false)
  return run(signal => showStep(router, index, signal))
}

export function startOnboardingTour(router) {
  return run(async signal => {
    if (signal.aborted) return false
    const store = currentStore()
    if (driverInstance?.isActive()) return false
    if (!store.active && !store.start(FIRST_STEP_ID)) return false
    returnFocus = typeof document !== 'undefined' ? document.activeElement : null
    const index = Math.max(0, stepIndex(store.activeStepId))
    if (index === 0 && store.activeStepId !== FIRST_STEP_ID) store.updateStep(FIRST_STEP_ID)
    return showStep(router, index, signal)
  })
}

export function resumeOnboardingTour(router) {
  const store = currentStore()
  if (!store.active || driverInstance?.isActive()) return Promise.resolve(false)
  const index = stepIndex(store.activeStepId)
  if (index < 0) {
    store.skip()
    return Promise.resolve(false)
  }
  return run(signal => showStep(router, index, signal))
}

export function restartOnboardingTour(router) {
  cancelOperation()
  destroyDriver(true)
  const store = currentStore()
  store.restart(FIRST_STEP_ID)
  returnFocus = typeof document !== 'undefined' ? document.activeElement : null
  return run(signal => showStep(router, 0, signal))
}

export function destroyOnboardingTour({ preserveState = false } = {}) {
  cancelOperation()
  const hadDriver = !!driverInstance
  destroyDriver(preserveState)
  if (!preserveState) {
    const store = currentStore()
    if (store.active) store.skip()
    if (!hadDriver) restoreTourFocus()
  }
}

export function initializeOnboardingTour(router) {
  const store = currentStore()
  if (removeRouteHook) removeRouteHook()
  removeRouteHook = router.afterEach((to, from, failure) => {
    // 内部跨页由showStep负责；用户主动离开不应被旧步骤拉回。
    if (failure || !store.active) return
    const internal = activeNavigation?.signal === operationController?.signal
      && !activeNavigation?.signal.aborted && activeNavigation?.target === to.fullPath
    if (!internal && to.fullPath !== from.fullPath) destroyOnboardingTour()
  })

  if (store.active) void resumeOnboardingTour(router)
  else if (store.isFirstVisit()) void startOnboardingTour(router)

  return () => {
    if (removeRouteHook) removeRouteHook()
    removeRouteHook = null
    destroyOnboardingTour({ preserveState: true })
  }
}
