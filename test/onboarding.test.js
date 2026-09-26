import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import {
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_VERSION,
  useOnboardingStore
} from '../src/stores/onboarding.js'
import {
  ONBOARDING_STEPS,
  runOnboardingCompletionAction,
  waitForElement
} from '../src/utils/onboardingTour.js'

function storage(initial = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem(key) { return values.get(key) ?? null },
    setItem(key, value) { values.set(key, String(value)) },
    removeItem(key) { values.delete(key) }
  }
}

function installStorage(value = storage()) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value })
  return () => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original)
    else delete globalThis.localStorage
  }
}

test('persists onboarding state and derives active from status', function () {
  const local = storage()
  const restore = installStorage(local)
  try {
    setActivePinia(createPinia())
    const store = useOnboardingStore()
    store.initialize()
    assert.equal(store.isFirstVisit(), true)
    assert.equal(store.active, false)

    assert.equal(store.start('welcome'), true)
    assert.equal(store.active, true)
    assert.equal(store.updateStep('operator-workspace'), true)
    assert.deepEqual(JSON.parse(local.getItem(ONBOARDING_STORAGE_KEY)), {
      version: ONBOARDING_VERSION,
      status: 'in_progress',
      activeStepId: 'operator-workspace'
    })

    store.complete()
    assert.equal(store.active, false)
    assert.equal(store.isFirstVisit(), false)
    store.restart('welcome')
    assert.equal(store.active, true)
    store.skip()
    assert.equal(store.status, 'skipped')
  } finally {
    restore()
  }
})

test('restores valid progress and ignores malformed saved state', function () {
  const valid = storage({
    [ONBOARDING_STORAGE_KEY]: JSON.stringify({
      version: ONBOARDING_VERSION,
      status: 'in_progress',
      activeStepId: 'inventory-workspace'
    })
  })
  let restore = installStorage(valid)
  try {
    setActivePinia(createPinia())
    const store = useOnboardingStore().initialize()
    assert.equal(store.status, 'in_progress')
    assert.equal(store.activeStepId, 'inventory-workspace')
  } finally {
    restore()
  }

  restore = installStorage(storage({
    [ONBOARDING_STORAGE_KEY]: JSON.stringify({
      version: ONBOARDING_VERSION,
      status: 'in_progress',
      activeStepId: 3
    })
  }))
  try {
    setActivePinia(createPinia())
    const store = useOnboardingStore().initialize()
    assert.equal(store.status, 'idle')
    assert.equal(store.activeStepId, null)
  } finally {
    restore()
  }
})

test('uses seven stable step ids and data-tour anchors including account creation', function () {
  assert.equal(ONBOARDING_STEPS.length, 7)
  assert.equal(new Set(ONBOARDING_STEPS.map(step => step.id)).size, ONBOARDING_STEPS.length)
  assert.ok(ONBOARDING_STEPS.every(step => /[a-z]/i.test(step.id)))
  assert.deepEqual(
    ONBOARDING_STEPS.slice(0, 3).map(step => step.id),
    ['welcome', 'account-create', 'today-overview']
  )
  assert.ok(
    ONBOARDING_STEPS.findIndex(step => step.id === 'maayuan-sync') <
    ONBOARDING_STEPS.findIndex(step => step.id === 'replay-entry')
  )

  const files = [
    '../src/components/GameAccountManager.vue',
    '../src/components/IslandSidebar.vue',
    '../src/pages/demo/index.vue',
    '../src/pages/operator/index.vue',
    '../src/pages/inventory/index.vue',
    '../src/pages/user/profile.vue'
  ].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')
  for (const step of ONBOARDING_STEPS.filter(step => step.target)) {
    if (step.target === 'operator-workspace') {
      assert.match(files, /tour-target=["']operator-workspace["']/)
      continue
    }
    assert.match(files, new RegExp(`data-tour=["']${step.target}["']`))
  }

  const accountStep = ONBOARDING_STEPS.find(step => step.id === 'account-create')
  assert.equal(accountStep.route, '/user/profile')
  assert.equal(accountStep.target, 'account-create')
  assert.match(accountStep.title, /确认子账号/)
  assert.match(accountStep.title, /确认/, '已有子账号的用户同样适用，不能写死“先创建”')
  assert.match(accountStep.description, /统一管理游戏账号/)
  assert.match(accountStep.description, /游戏子账号/)
  assert.match(accountStep.description, /已有/)
  assert.match(accountStep.description, /所属游戏/)
  assert.match(accountStep.description, /创建账号/)

  const accountWorkspace = readFileSync(new URL('../src/components/AccountWorkspace.vue', import.meta.url), 'utf8')
  assert.match(accountWorkspace, /class=["']workspace-summary["'][^>]*:data-tour=["']tourTarget \|\| undefined["']/)

  const syncStep = ONBOARDING_STEPS.find(step => step.id === 'maayuan-sync')
  assert.equal(syncStep.route, '/user/profile')
  assert.equal(syncStep.target, 'maayuan-sync')
  assert.equal(syncStep.doneBtnText, '打开连接设置')
  assert.equal(syncStep.completionAction, 'click-target')
  assert.match(syncStep.description, /创建 MaaYuan 连接码/)
  assert.match(syncStep.description, /确认账号与权限/)
  assert.match(syncStep.description, /左侧“账号与连接码”/)
  assert.match(syncStep.description, /连接面板里也可以补建/)
})

test('MaaYuan final onboarding action opens the existing connect entry once', function () {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  let clicks = 0
  const element = {
    click() { clicks += 1 },
    getAttribute(name) { return name === 'aria-expanded' ? 'false' : null }
  }
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      querySelectorAll(selector) {
        return selector === '[data-tour="maayuan-sync"]' ? [element] : []
      }
    }
  })
  try {
    const syncStep = ONBOARDING_STEPS.find(step => step.id === 'maayuan-sync')
    assert.equal(runOnboardingCompletionAction(syncStep), true)
    assert.equal(clicks, 1)

    element.getAttribute = name => name === 'aria-expanded' ? 'true' : null
    assert.equal(runOnboardingCompletionAction(syncStep), true)
    assert.equal(clicks, 1)
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else delete globalThis.document
  }
})

test('waitForElement picks the visible anchor when responsive duplicates exist', async function () {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const hidden = {
    offsetWidth: 0,
    offsetHeight: 0,
    getClientRects() { return [] }
  }
  const visible = {
    offsetWidth: 120,
    offsetHeight: 44,
    getClientRects() { return [{}] }
  }
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      documentElement: {},
      querySelectorAll(selector) {
        return selector === '[data-tour="operator-workspace"]' ? [hidden, visible] : []
      }
    }
  })
  try {
    assert.equal(await waitForElement('operator-workspace', 5), visible)
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else delete globalThis.document
  }
})

test('waitForElement resolves null after its finite timeout', async function () {
  const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const originalObserver = Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver')
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: {
      documentElement: {},
      querySelector() { return null },
      querySelectorAll() { return [] }
    }
  })
  delete globalThis.MutationObserver
  try {
    assert.equal(await waitForElement('missing-target', 5), null)
  } finally {
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument)
    else delete globalThis.document
    if (originalObserver) Object.defineProperty(globalThis, 'MutationObserver', originalObserver)
  }
})
