import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createPinia, setActivePinia } from 'pinia'
import {
  ONBOARDING_STORAGE_KEY,
  ONBOARDING_VERSION,
  useOnboardingStore
} from '../src/stores/onboarding.js'
import { ONBOARDING_STEPS, waitForElement } from '../src/utils/onboardingTour.js'

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

test('uses five stable step ids and data-tour anchors', function () {
  assert.equal(ONBOARDING_STEPS.length, 5)
  assert.equal(new Set(ONBOARDING_STEPS.map(step => step.id)).size, ONBOARDING_STEPS.length)
  assert.ok(ONBOARDING_STEPS.every(step => /[a-z]/i.test(step.id)))

  const files = [
    '../src/components/IslandSidebar.vue',
    '../src/pages/demo/index.vue',
    '../src/pages/operator/index.vue',
    '../src/pages/inventory/index.vue'
  ].map(path => readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n')
  for (const step of ONBOARDING_STEPS.filter(step => step.target)) {
    assert.match(files, new RegExp(`data-tour=["']${step.target}["']`))
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
