import { driver } from 'driver.js'
import { useOnboardingStore } from '../stores/onboarding.js'

const FIRST_STEP_ID = 'welcome'
const TARGET_TIMEOUT = 5000

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
    description: '在“统一管理游戏账号”里确认已有的游戏子账号，或新建一个。选择所属游戏并填写名称后点击“创建账号”；密探、库存、星石、奖励流水和连接码都会归属到这个子账号。',
    side: 'bottom',
    align: 'start'
  },
  {
    id: 'today-overview',
    route: '/',
    target: 'today-overview',
    title: '先看「今日一览」',
    description: '不知道从哪里开始时就来这里。它会汇总今天值得关注的事项，并把常用功能集中成入口。',
    side: 'bottom',
    align: 'start'
  },
  {
    id: 'operator-workspace',
    route: '/operator',
    target: 'operator-workspace',
    title: '管理密探档案',
    description: '这里先确认当前子账号与游戏版本；展开“账号与分享”后，可以继续维护密探养成进度、数据交换和 BOX 分享。',
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
    description: '创建 MaaYuan 连接码前先确认账号与权限，再把连接码粘贴到 MaaYuan；之后可按任务自动同步派遣 / 情报奖励、密探信息、背包道具和星石。点击“打开连接设置”后，页面会继续给出具体任务与开关位置。<br><br>以后也可以从左侧“账号与连接码”回来管理；如果还没有子账号，连接面板里也可以补建。（可选步骤，也可以手动录入数据）',
    side: 'top',
    align: 'start',
    doneBtnText: '打开连接设置',
    completionAction: 'click-target'
  },
  {
    id: 'replay-entry',
    target: 'replay-entry',
    title: '忘了也没关系',
    description: '以后需要复习时，从这个入口就能重新启动教程，不用记住每个页面的位置。',
    side: 'right',
    align: 'center'
  }
]

let driverInstance = null
let operation = null
let preserveStateOnDestroy = false
let removeRouteHook = null

function isVisible(element) {
  if (!element) return false
  if (element.offsetWidth > 0 || element.offsetHeight > 0) return true
  if (typeof element.getClientRects === 'function') return element.getClientRects().length > 0
  return true
}

function findTarget(target) {
  if (typeof document === 'undefined' || !target) return null
  const elements = Array.from(document.querySelectorAll(`[data-tour="${target}"]`))
  return elements.find(isVisible) || null
}

export function runOnboardingCompletionAction(step) {
  if (!step || step.completionAction !== 'click-target' || !step.target) return false
  const element = findTarget(step.target)
  if (!element || typeof element.click !== 'function') return false
  if (element.getAttribute?.('aria-expanded') === 'true') return true
  element.click()
  return true
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

function revealTourTarget(element) {
  const revealElement = element?.closest?.('.rv')
  if (revealElement) revealElement.classList.add('in')
}

function waitForLayoutFrames(count = 1) {
  if (count <= 0 || typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    return Promise.resolve()
  }
  return new Promise(resolve => {
    window.requestAnimationFrame(() => {
      void waitForLayoutFrames(count - 1).then(resolve)
    })
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
        side: step.side || 'bottom',
        align: step.align || 'start',
        doneBtnText: step.doneBtnText
      }
    })),
    onNextClick: (_element, _step, options) => {
      void moveToIndex(router, (options.index ?? 0) + 1)
    },
    onPrevClick: (_element, _step, options) => {
      void moveToIndex(router, (options.index ?? 0) - 1)
    },
    onDoneClick: () => {
      const activeStep = ONBOARDING_STEPS[instance.getActiveIndex() ?? -1]
      store.complete()
      destroyDriver()
      runOnboardingCompletionAction(activeStep)
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
    await waitForLayoutFrames(1)
  }

  let targetElement = step.target ? await waitForElement(step.target) : null
  if (step.target && !targetElement) {
    store.skip()
    destroyDriver()
    return false
  }

  revealTourTarget(targetElement)
  bringTargetIntoView(targetElement)
  await waitForLayoutFrames(2)

  if (step.target) {
    targetElement = findTarget(step.target) || targetElement
    revealTourTarget(targetElement)
  }

  const instance = driverInstance?.isActive() ? driverInstance : createDriver(router)
  instance.drive(index)
  await waitForLayoutFrames(2)
  instance.refresh?.()
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
