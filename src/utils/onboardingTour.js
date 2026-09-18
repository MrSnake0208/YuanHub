import { driver } from 'driver.js'
import { useOnboardingStore } from '../stores/onboarding.js'

const FIRST_STEP_ID = 'welcome'
const TARGET_TIMEOUT = 5000

export const ONBOARDING_STEPS = [
  {
    id: FIRST_STEP_ID,
    title: '欢迎来到 YuanHub',
    description: '用不到一分钟认识 TODAY、密探养成和库存追踪。你可以随时跳过，之后也能重新查看。'
  },
  {
    id: 'today-overview',
    route: '/',
    target: 'today-overview',
    title: '从 TODAY 开始',
    description: '这里会根据当前状态告诉你今天适合做什么，也能直接找到 YuanHub 的常用功能。'
  },
  {
    id: 'operator-workspace',
    route: '/operator',
    target: 'operator-workspace',
    title: '管理密探档案',
    description: '选择游戏账号后，可以维护密探图鉴、养成进度并分享自己的 BOX。'
  },
  {
    id: 'inventory-workspace',
    route: '/inventory',
    target: 'inventory-workspace',
    title: '追踪库存变化',
    description: '在库存工作区清点资源、查看统计报告，并让库存与密探账号保持一致。'
  },
  {
    id: 'replay-entry',
    target: 'replay-entry',
    title: '随时重新查看',
    description: '以后想再看一遍，可以从这里重新启动新手教程。'
  }
]

let driverInstance = null
let operation = null
let preserveStateOnDestroy = false
let removeRouteHook = null

function isVisible(element) {
  return !!element && (element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0)
}

function findTarget(target) {
  if (typeof document === 'undefined' || !target) return null
  if (target === 'replay-entry') {
    return Array.from(document.querySelectorAll('[data-tour="replay-entry"]')).find(isVisible) || null
  }
  return document.querySelector(`[data-tour="${target}"]`)
}

export function waitForElement(target, timeout = TARGET_TIMEOUT) {
  const existing = findTarget(target)
  if (existing) return Promise.resolve(existing)
  if (typeof document === 'undefined') return Promise.resolve(null)

  return new Promise(resolve => {
    let observer = null
    const finish = element => {
      if (observer) observer.disconnect()
      globalThis.clearTimeout(timer)
      resolve(element || null)
    }
    const timer = globalThis.setTimeout(() => finish(findTarget(target)), timeout)

    if (typeof MutationObserver === 'undefined') return
    observer = new MutationObserver(() => {
      const element = findTarget(target)
      if (element) finish(element)
    })
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
  })
}

function stepIndex(stepId) {
  return ONBOARDING_STEPS.findIndex(step => step.id === stepId)
}

function currentStore() {
  return useOnboardingStore().initialize()
}

function destroyDriver(preserveState = false) {
  if (!driverInstance) return
  preserveStateOnDestroy = preserveState
  const current = driverInstance
  driverInstance = null
  current.destroy()
}

function createDriver(router) {
  const store = currentStore()
  const instance = driver({
    animate: typeof window === 'undefined' || !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
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
    smoothScroll: true,
    stagePadding: 10,
    stageRadius: 14,
    steps: ONBOARDING_STEPS.map(step => ({
      element: step.target ? () => findTarget(step.target) : undefined,
      popover: {
        title: step.title,
        description: step.description,
        side: 'bottom',
        align: 'start'
      }
    })),
    onNextClick: (_element, _step, options) => {
      void moveToIndex(router, (options.index ?? 0) + 1)
    },
    onPrevClick: (_element, _step, options) => {
      void moveToIndex(router, (options.index ?? 0) - 1)
    },
    onDoneClick: () => {
      store.complete()
      destroyDriver()
    },
    onCloseClick: () => {
      store.skip()
      destroyDriver()
    },
    onPopoverRender: popover => {
      popover.closeButton.setAttribute('aria-label', '跳过新手教程')
      popover.closeButton.title = '跳过新手教程'
    },
    onDestroyed: () => {
      const preserve = preserveStateOnDestroy
      preserveStateOnDestroy = false
      if (driverInstance === instance) driverInstance = null
      if (!preserve && store.active) store.skip()
    }
  })
  driverInstance = instance
  return instance
}

async function showStep(router, index) {
  const store = currentStore()
  const step = ONBOARDING_STEPS[index]
  if (!step) {
    store.complete()
    destroyDriver()
    return false
  }

  store.updateStep(step.id)
  if (step.route && router.currentRoute.value.path !== step.route) {
    destroyDriver(true)
    await router.push(step.route)
  }

  if (step.target && !await waitForElement(step.target)) {
    store.skip()
    destroyDriver()
    return false
  }

  const instance = driverInstance?.isActive() ? driverInstance : createDriver(router)
  instance.drive(index)
  return true
}

function run(operationCallback) {
  if (operation) return operation
  operation = Promise.resolve()
    .then(operationCallback)
    .catch(() => {
      const store = currentStore()
      if (store.active) store.skip()
      destroyDriver()
      return false
    })
    .finally(() => { operation = null })
  return operation
}

function moveToIndex(router, index) {
  if (index < 0) return Promise.resolve(false)
  return run(() => showStep(router, index))
}

export function startOnboardingTour(router) {
  return run(async () => {
    const store = currentStore()
    if (driverInstance?.isActive()) return false
    if (!store.active && !store.start(FIRST_STEP_ID)) return false
    const index = Math.max(0, stepIndex(store.activeStepId))
    if (index === 0 && store.activeStepId !== FIRST_STEP_ID) store.updateStep(FIRST_STEP_ID)
    return showStep(router, index)
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
  return run(() => showStep(router, index))
}

export function restartOnboardingTour(router) {
  destroyDriver(true)
  const store = currentStore()
  store.restart(FIRST_STEP_ID)
  return run(() => showStep(router, 0))
}

export function destroyOnboardingTour({ preserveState = false } = {}) {
  destroyDriver(preserveState)
  if (!preserveState) {
    const store = currentStore()
    if (store.active) store.skip()
  }
}

export function initializeOnboardingTour(router) {
  const store = currentStore()
  if (removeRouteHook) removeRouteHook()
  removeRouteHook = router.afterEach(() => {
    if (store.active) void resumeOnboardingTour(router)
  })

  if (store.active) void resumeOnboardingTour(router)
  else if (store.isFirstVisit()) void startOnboardingTour(router)

  return () => {
    if (removeRouteHook) removeRouteHook()
    removeRouteHook = null
    destroyOnboardingTour({ preserveState: true })
  }
}
